"""Chapter summary, extraction, and outline generation service."""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from application.ai.llm_json_extract import repair_json, strip_json_fences
from application.engine.services.editor_generation_service import (
    EditorGenerationService,
    ProviderConfig,
)
from domain.ai.services.llm_service import GenerationConfig
from domain.ai.value_objects.prompt import Prompt

VALID_GRAPH_ENTITY_TYPES = {
    "character",
    "location",
    "event",
    "item",
    "faction",
    "world_rule",
    "plot_hook",
}
MEMORY_TYPES = {"character", "world_rule"}


@dataclass(frozen=True)
class ChapterSummaryRequest:
    provider: ProviderConfig
    chapter_title: str
    content: str


@dataclass(frozen=True)
class ChapterExtractRequest:
    provider: ProviderConfig
    chapter_title: str
    content: str
    known_entity_names: list[str]


@dataclass(frozen=True)
class ChapterEntityExtractRequest:
    provider: ProviderConfig
    chapter_title: str
    content: str


@dataclass(frozen=True)
class OutlineRequest:
    provider: ProviderConfig
    synopsis: str
    existing_chapter_count: int


class ChapterGenerationService:
    """Backend-side service for chapter completion helpers."""

    def __init__(self) -> None:
        self._editor_service = EditorGenerationService()

    async def generate_chapter_summary(self, request: ChapterSummaryRequest) -> str:
        content = request.content.strip()
        if len(content) < 100:
            raise ValueError("chapter content must contain at least 100 characters")

        prompt = Prompt(
            system=(
                "You write compact objective chapter summaries for fiction. "
                "Return only the summary text in the same language as the chapter."
            ),
            user=(
                "Summarize the chapter below in about 100-150 words. Focus on key events, "
                "character actions, and emotional changes. Do not add a title or prefix.\n\n"
                f"[Chapter Title]\n{request.chapter_title}\n\n"
                f"[Chapter Content]\n{content[:5000]}"
            ),
        )
        result = await self._generate(
            request.provider,
            prompt,
            GenerationConfig(
                model=request.provider.model,
                max_tokens=2048,
                temperature=0.3,
            ),
        )
        return result.content.strip()

    async def extract_chapter_all(self, request: ChapterExtractRequest) -> dict[str, Any]:
        content = request.content.strip()
        if len(content) < 100:
            return {"memories": [], "graphEntities": [], "graphRelations": []}

        known_names = [
            name.strip()
            for name in request.known_entity_names
            if isinstance(name, str) and name.strip()
        ][:50]
        known_block = ", ".join(known_names) or "None"

        prompt = Prompt(
            system=(
                "You extract structured chapter memory and graph data from fiction. "
                "Return only one JSON object.\n"
                "{\n"
                '  "memories": [{"type": "character|world_rule", "name": "Name", "content": "Fact"}],\n'
                '  "graph": {\n'
                '    "entities": [{"name": "Name", "type": "character|location|event|item|faction|world_rule|plot_hook", '
                '"attributes": {"key": "value"}, "observations": ["fact"], "tags": ["tag"]}],\n'
                '    "relations": [{"from": "A", "to": "B", "relationType": "verb phrase", "weight": 0.8, "notes": "optional"}]\n'
                "  }\n"
                "}\n"
                "Rules:\n"
                "- memories: only long-term character/world facts newly revealed or changed in this chapter.\n"
                "- keep each memory content concise.\n"
                "- graph entities and relations must be explicit in the text.\n"
                "- prefer exact names from the known entity list when available.\n"
                "- do not wrap JSON in markdown."
            ),
            user=(
                f"[Known Entity Names]\n{known_block}\n\n"
                f"[Chapter Title]\n{request.chapter_title}\n\n"
                f"[Chapter Content]\n{content[:6000]}"
            ),
        )
        result = await self._generate(
            request.provider,
            prompt,
            GenerationConfig(
                model=request.provider.model,
                max_tokens=4096,
                temperature=0.15,
            ),
        )
        parsed = self._parse_json_object(result.content)
        memories = self._normalize_memories(parsed.get("memories"))

        graph = parsed.get("graph")
        graph_entities = []
        graph_relations = []
        if isinstance(graph, dict):
            graph_entities = self._normalize_graph_entities(graph.get("entities"))
            graph_relations = self._normalize_graph_relations(graph.get("relations"))

        return {
            "memories": memories,
            "graphEntities": graph_entities,
            "graphRelations": graph_relations,
        }

    async def extract_chapter_entities(self, request: ChapterEntityExtractRequest) -> list[dict[str, str]]:
        content = request.content.strip()
        if len(content) < 100:
            return []

        prompt = Prompt(
            system=(
                "You extract long-term memory items from fiction chapters. "
                "Return only a JSON array of objects like "
                '[{"type":"character","name":"Name","content":"Fact"}].'
            ),
            user=(
                "Extract only new or changed long-term facts from the chapter below.\n"
                "- type must be character or world_rule.\n"
                "- keep content concise.\n"
                "- return [] if there is nothing worth storing.\n\n"
                f"[Chapter Title]\n{request.chapter_title}\n\n"
                f"[Chapter Content]\n{content[:6000]}"
            ),
        )
        result = await self._generate(
            request.provider,
            prompt,
            GenerationConfig(
                model=request.provider.model,
                max_tokens=4096,
                temperature=0.15,
            ),
        )
        return self._normalize_memories(self._parse_json_array(result.content))

    async def generate_outline(self, request: OutlineRequest) -> list[dict[str, str]]:
        synopsis = request.synopsis.strip()
        if not synopsis:
            return []

        prompt = Prompt(
            system=(
                "You are a fiction outlining editor. Return only a JSON array of 5 chapter cards. "
                'Each item must look like {"title":"Chapter title","synopsis":"Short chapter synopsis"}.'
            ),
            user=(
                "Based on the work synopsis below, plan the next 5 chapters. "
                "Write in the same language as the synopsis. Keep each synopsis concise and specific.\n\n"
                f"[Work Synopsis]\n{synopsis[:4000]}\n\n"
                f"[Existing Chapter Count]\n{request.existing_chapter_count}"
            ),
        )
        result = await self._generate(
            request.provider,
            prompt,
            GenerationConfig(
                model=request.provider.model,
                max_tokens=2048,
                temperature=0.7,
            ),
        )
        raw_items = self._parse_json_array(result.content)
        outline: list[dict[str, str]] = []
        for item in raw_items:
            if not isinstance(item, dict):
                continue
            title = self._clean_text(item.get("title"))
            synopsis_text = self._clean_text(item.get("synopsis"))
            if title and synopsis_text:
                outline.append({"title": title, "synopsis": synopsis_text})
        return outline[:5]

    async def _generate(
        self,
        provider: ProviderConfig,
        prompt: Prompt,
        config: GenerationConfig,
    ):
        return await self._editor_service._generate(provider, prompt, config)

    @staticmethod
    def _parse_json_object(raw: str) -> dict[str, Any]:
        cleaned = strip_json_fences(raw).strip()
        extracted = ChapterGenerationService._extract_json_region(cleaned, "{", "}")
        if not extracted:
            return {}
        try:
            data = json.loads(repair_json(extracted))
        except json.JSONDecodeError:
            return {}
        return data if isinstance(data, dict) else {}

    @staticmethod
    def _parse_json_array(raw: str) -> list[Any]:
        cleaned = strip_json_fences(raw).strip()
        extracted = ChapterGenerationService._extract_json_region(cleaned, "[", "]")
        if not extracted:
            return []
        try:
            data = json.loads(repair_json(extracted))
        except json.JSONDecodeError:
            return []
        return data if isinstance(data, list) else []

    @staticmethod
    def _extract_json_region(text: str, left: str, right: str) -> str:
        start = text.find(left)
        end = text.rfind(right)
        if start == -1 or end == -1 or end <= start:
            return ""
        return text[start : end + 1]

    @staticmethod
    def _clean_text(value: Any) -> str:
        if not isinstance(value, str):
            return ""
        return value.strip()

    @staticmethod
    def _normalize_memories(raw_items: Any) -> list[dict[str, str]]:
        if not isinstance(raw_items, list):
            return []

        memories: list[dict[str, str]] = []
        for item in raw_items:
            if not isinstance(item, dict):
                continue
            item_type = ChapterGenerationService._clean_text(item.get("type"))
            name = ChapterGenerationService._clean_text(item.get("name"))
            content = ChapterGenerationService._clean_text(item.get("content"))
            if item_type in MEMORY_TYPES and name and content:
                memories.append({"type": item_type, "name": name, "content": content})
        return memories

    @staticmethod
    def _normalize_graph_entities(raw_items: Any) -> list[dict[str, Any]]:
        if not isinstance(raw_items, list):
            return []

        entities: list[dict[str, Any]] = []
        for item in raw_items:
            if not isinstance(item, dict):
                continue
            name = ChapterGenerationService._clean_text(item.get("name"))
            entity_type = ChapterGenerationService._clean_text(item.get("type"))
            if not name or entity_type not in VALID_GRAPH_ENTITY_TYPES:
                continue

            attributes = item.get("attributes")
            observations = item.get("observations")
            tags = item.get("tags")
            entities.append(
                {
                    "name": name,
                    "type": entity_type,
                    "attributes": (
                        {
                            str(key): str(value)
                            for key, value in attributes.items()
                            if str(key).strip() and str(value).strip()
                        }
                        if isinstance(attributes, dict)
                        else {}
                    ),
                    "observations": [
                        str(value).strip()
                        for value in observations
                        if str(value).strip()
                    ] if isinstance(observations, list) else [],
                    "tags": [
                        str(value).strip()
                        for value in tags
                        if str(value).strip()
                    ] if isinstance(tags, list) else [],
                }
            )
        return entities

    @staticmethod
    def _normalize_graph_relations(raw_items: Any) -> list[dict[str, Any]]:
        if not isinstance(raw_items, list):
            return []

        relations: list[dict[str, Any]] = []
        for item in raw_items:
            if not isinstance(item, dict):
                continue
            from_name = ChapterGenerationService._clean_text(item.get("from"))
            to_name = ChapterGenerationService._clean_text(item.get("to"))
            relation_type = ChapterGenerationService._clean_text(item.get("relationType"))
            if not from_name or not to_name or not relation_type:
                continue

            weight = item.get("weight")
            weight_value: float | None = None
            if isinstance(weight, (int, float)):
                weight_value = max(0.0, min(1.0, float(weight)))

            notes = ChapterGenerationService._clean_text(item.get("notes"))
            relation: dict[str, Any] = {
                "from": from_name,
                "to": to_name,
                "relationType": relation_type,
            }
            if weight_value is not None:
                relation["weight"] = weight_value
            if notes:
                relation["notes"] = notes
            relations.append(relation)
        return relations
