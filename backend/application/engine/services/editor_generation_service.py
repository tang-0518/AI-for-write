"""Editor generation service for inline writing tasks."""
from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass
from typing import AsyncIterator, Literal

from domain.ai.services.llm_service import GenerationConfig, GenerationResult
from domain.ai.value_objects.prompt import Prompt
from infrastructure.ai.config.settings import Settings
from infrastructure.ai.providers.anthropic_provider import AnthropicProvider
from infrastructure.ai.providers.gemini_provider import GeminiProvider
from infrastructure.ai.providers.openai_provider import OpenAIProvider
from infrastructure.ai.url_utils import (
    normalize_anthropic_base_url,
    normalize_gemini_base_url,
    normalize_openai_base_url,
)

ProviderName = Literal["gemini", "openai", "anthropic"]
PolishMode = Literal["standard", "spot-fix", "rewrite", "rework", "anti-detect"]
RewriteAngle = Literal["narrative", "psychological", "dialogue"]

CONTEXT_TAIL_CHARS = 2200
POLISH_CHUNK_CHARS = 2000
GEMINI_SAFETY_SETTINGS = [
    {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
]
STYLE_PROMPTS = {
    "wuxia": "以金庸古龙式武侠江湖笔法，侠气纵横",
    "romance": "以细腻温柔的情感描写，缠绵悱恻",
    "mystery": "以紧张悬疑的笔法，层层推进，伏笔密布",
    "scifi": "以硬科幻世界观，逻辑严密，细节考究",
}
CREATIVITY_TEMPERATURES = {
    "precise": 0.65,
    "balanced": 0.82,
    "creative": 1.0,
    "wild": 1.2,
}
WRITE_LENGTH_TOKEN_TARGETS = {
    "short": 8192,
    "medium": 16384,
    "long": 32768,
}
WRITE_LENGTH_WORD_TARGETS = {
    "short": 150,
    "medium": 300,
    "long": 500,
}
REWRITE_ANGLE_META: dict[RewriteAngle, dict[str, str]] = {
    "narrative": {
        "label": "叙事视角",
        "instruction": "改写为流畅的第三人称叙事，强化场景画面感，保留核心情节。",
    },
    "psychological": {
        "label": "心理独白",
        "instruction": "改写为更贴近角色内心的心理独白，突出情绪和自我感受。",
    },
    "dialogue": {
        "label": "对话化",
        "instruction": "改写为以对话推进的场景，保留情节信息，让角色声线更鲜明。",
    },
}
POLISH_MODE_INSTRUCTIONS: dict[PolishMode, list[str]] = {
    "standard": [
        "你是一位专业的中文文字编辑，请进行小说润色。",
        "任务：修改病句、优化措辞、增强文学性，保留原意与情节，输出字数不超过原文 110%。",
        "输出规则：直接输出润色后的完整正文，不要解释，不要分析。",
    ],
    "spot-fix": [
        "你是一位严谨的中文校对员。",
        "任务：仅修正错别字、语法错误、标点使用不当，严禁改动文字风格、词汇选择和句式结构。",
        "输出规则：直接输出修正后的全文，不要解释，保持原文风格 99% 不变。",
    ],
    "rewrite": [
        "你是一位擅长改稿的中文小说作家，请对文本进行重写。",
        "任务：完整保留情节、动作和信息量，用全新的语句重新表达，改变句式结构和词汇选择。",
        "输出规则：直接输出重写后的全文，内容与原文等量，不要解释。",
    ],
    "rework": [
        "你是一位资深中文小说结构编辑，请对文本进行重构。",
        "任务：重新组织段落结构和叙事节奏，使逻辑更清晰、推进更流畅，可调整段落划分，但不得删减核心情节。",
        "输出规则：直接输出重构后的全文，不要解释，也不要说明修改之处。",
    ],
    "anti-detect": [
        "你是一位专门负责去 AI 化的中文文字处理专家。",
        "任务：在保留全部情节、对话和信息的前提下，降低模板化表达，打散刻板排比，让句子更像真人写作。",
        "输出规则：直接输出改写后的全文，不要解释，不要标注修改之处。",
    ],
}


@dataclass(frozen=True)
class ProviderConfig:
    api_key: str
    model: str
    provider: ProviderName
    base_url: str | None = None


@dataclass(frozen=True)
class ContinueRequest:
    provider: ProviderConfig
    style: str
    custom_prompt: str
    creativity: str
    write_length: str
    content: str
    one_time_prompt: str = ""
    memory_context: str = ""
    prev_chapter_tail: str = ""
    style_block: str = ""
    version_angle: str | None = None
    temperature_override: float | None = None


@dataclass(frozen=True)
class ResumeRequest:
    provider: ProviderConfig
    creativity: str
    write_length: str
    original_text: str
    truncated_part: str


@dataclass(frozen=True)
class PolishRequest:
    provider: ProviderConfig
    style: str
    custom_prompt: str
    text: str
    one_time_prompt: str = ""
    memory_context: str = ""
    mode: PolishMode = "standard"


@dataclass(frozen=True)
class RewriteRequest:
    provider: ProviderConfig
    text: str
    angle: RewriteAngle
    memory_context: str = ""


@dataclass(frozen=True)
class ExplainRequest:
    provider: ProviderConfig
    text: str


class EditorGenerationService:
    """Python-side editor generation service."""

    @staticmethod
    def infer_provider(model: str, provider: str | None = None, base_url: str | None = None) -> ProviderName:
        explicit = (provider or "").strip().lower()
        if explicit in {"gemini", "openai", "anthropic"}:
            return explicit  # type: ignore[return-value]

        model_name = (model or "").strip().lower()
        base = (base_url or "").strip().lower()

        if "gemini" in model_name or "generativelanguage" in base:
            return "gemini"
        if model_name.startswith("claude") or "anthropic" in base:
            return "anthropic"
        return "openai"

    async def stream_continue(self, request: ContinueRequest) -> AsyncIterator[dict[str, object]]:
        system_text = self._build_system_instruction(request.style, request.custom_prompt)
        memory_only, compact_summary = self._split_compact_summary(request.memory_context)
        user_message = self._build_continue_user_message(
            text=request.content,
            write_length=request.write_length,
            one_time_prompt=request.one_time_prompt,
            memory_context=memory_only,
            compact_summary=compact_summary,
            prev_chapter_tail=request.prev_chapter_tail,
            style_block=request.style_block,
            version_angle=request.version_angle,
        )
        prompt = Prompt(system=system_text, user=user_message)
        config = GenerationConfig(
            model=request.provider.model,
            max_tokens=self._get_write_max_output_tokens(request.write_length, request.provider.model),
            temperature=request.temperature_override if request.temperature_override is not None else self._get_temperature(request.creativity),
        )
        result = await self._generate(request.provider, prompt, config)
        async for event in self._stream_result(result, config.max_tokens):
            yield event

    async def stream_resume(self, request: ResumeRequest) -> AsyncIterator[dict[str, object]]:
        tail = (request.original_text + request.truncated_part)[-1800:]
        prompt = Prompt(
            system="你是一位专业的中文小说续写助手，负责无缝衔接被截断的正文。",
            user=(
                "你正在续写一篇小说，上一段输出因为达到字数上限而中断。"
                "请从中断处继续，无缝衔接，不要重复已有内容，不要解释，直接续写正文。\n\n"
                "【已有内容结尾（请从此处衔接）】\n"
                f"{tail}"
            ),
        )
        config = GenerationConfig(
            model=request.provider.model,
            max_tokens=self._get_write_max_output_tokens(request.write_length, request.provider.model),
            temperature=self._get_temperature(request.creativity),
        )
        result = await self._generate(request.provider, prompt, config)
        async for event in self._stream_result(result, config.max_tokens):
            yield event

    async def polish_text(self, request: PolishRequest) -> str:
        text_len = len(re.sub(r"\s+", "", request.text))
        if text_len <= POLISH_CHUNK_CHARS:
            return await self._polish_chunk(request.text, request)

        chunks = self._split_into_polish_chunks(request.text, POLISH_CHUNK_CHARS)
        results: list[str] = []
        needs_carryover = request.mode in {"rework", "anti-detect"}

        for index, chunk in enumerate(chunks):
            chunk_prompt = request.one_time_prompt if index == 0 else ""
            chunk_memory = request.memory_context if index == 0 else ""
            if needs_carryover and index > 0 and results[index - 1]:
                prev_tail = results[index - 1][-200:]
                chunk_memory = f"<前段结尾（保持风格衔接）>{prev_tail}</前段结尾>"

            chunk_request = PolishRequest(
                provider=request.provider,
                style=request.style,
                custom_prompt=request.custom_prompt,
                text=chunk,
                one_time_prompt=chunk_prompt,
                memory_context=chunk_memory,
                mode=request.mode,
            )
            results.append(await self._polish_chunk(chunk, chunk_request))

        return "\n\n".join(results)

    async def rewrite_text(self, request: RewriteRequest) -> str:
        meta = REWRITE_ANGLE_META[request.angle]
        char_count = len(request.text)
        parts = [
            f"改写要求：{meta['instruction']}",
            f"输出字数与原文相当（原文约 {char_count} 字），不得增删核心情节。",
            "只输出改写后的正文，不要解释。",
        ]
        if request.memory_context.strip():
            parts.append(f"参考背景：{request.memory_context[:300]}")
        parts.append(f"原文：\n{request.text}")

        prompt = Prompt(
            system="你是一位擅长局部改写的中文小说编辑。",
            user="\n".join(parts),
        )
        config = GenerationConfig(
            model=request.provider.model,
            max_tokens=min(
                self._get_model_max_output_tokens(request.provider.model),
                max(512, int(char_count * 1.5)),
            ),
            temperature=0.75,
        )
        result = await self._generate(request.provider, prompt, config)
        return result.content.strip()

    async def explain_text(self, request: ExplainRequest) -> str:
        prompt = Prompt(
            system="你是一位简洁清楚的中文文本讲解助手。",
            user=(
                "请用不超过 80 字，简洁解释以下文本的含义、语境或潜台词。"
                "只输出解释正文，不要加标题。\n\n"
                f"\"{request.text}\""
            ),
        )
        config = GenerationConfig(model=request.provider.model, max_tokens=180, temperature=0.3)
        result = await self._generate(request.provider, prompt, config)
        return result.content.strip()

    async def _polish_chunk(self, text: str, request: PolishRequest) -> str:
        system_text = self._build_polish_system_instruction(request.style, request.custom_prompt, request.mode)
        user_message = self._build_polish_dynamic_block(text, request.one_time_prompt, request.memory_context, request.mode)
        prompt = Prompt(system=system_text, user=user_message)
        config = GenerationConfig(
            model=request.provider.model,
            max_tokens=self._get_model_max_output_tokens(request.provider.model),
            temperature=0.6,
        )
        result = await self._generate(request.provider, prompt, config)
        if self._is_likely_truncated(result, config.max_tokens):
            return result.content.strip() + "\n[……此段润色截断，请缩短段落后重试]"
        return result.content.strip()

    async def _generate(self, provider: ProviderConfig, prompt: Prompt, config: GenerationConfig) -> GenerationResult:
        client = self._create_provider(provider)
        return await client.generate(prompt, config)

    def _create_provider(self, provider: ProviderConfig):
        extra_body: dict[str, object] = {}
        base_url = provider.base_url

        if provider.provider == "gemini":
            base_url = normalize_gemini_base_url(base_url)
            extra_body["safetySettings"] = GEMINI_SAFETY_SETTINGS
            if self._supports_no_thinking(provider.model):
                extra_body["generationConfig"] = {"thinkingConfig": {"thinkingBudget": 0}}
            settings = Settings(
                api_key=provider.api_key,
                default_model=provider.model,
                base_url=base_url,
                extra_body=extra_body,
            )
            return GeminiProvider(settings)

        if provider.provider == "anthropic":
            settings = Settings(
                api_key=provider.api_key,
                default_model=provider.model,
                base_url=normalize_anthropic_base_url(base_url),
            )
            return AnthropicProvider(settings)

        settings = Settings(
            api_key=provider.api_key,
            default_model=provider.model,
            base_url=normalize_openai_base_url(base_url),
            use_legacy_chat_completions=False,
        )
        return OpenAIProvider(settings)

    async def _stream_result(self, result: GenerationResult, max_tokens: int) -> AsyncIterator[dict[str, object]]:
        text = result.content.strip()
        chunk_size = self._get_stream_chunk_size(text)
        for index in range(0, len(text), chunk_size):
            yield {"type": "chunk", "text": text[index:index + chunk_size]}
            await asyncio.sleep(0)

        if self._is_likely_truncated(result, max_tokens):
            yield {"type": "truncated"}
        yield {"type": "done"}

    @staticmethod
    def _get_stream_chunk_size(text: str) -> int:
        if len(text) <= 120:
            return 24
        return min(96, max(24, len(text) // 18))

    @staticmethod
    def _is_likely_truncated(result: GenerationResult, max_tokens: int) -> bool:
        output_tokens = result.token_usage.output_tokens
        if output_tokens <= 0:
            return False
        if output_tokens >= int(max_tokens * 0.98):
            return True

        text = result.content.rstrip()
        if output_tokens >= int(max_tokens * 0.92) and text and text[-1] not in "。！？!?…】」』）)\"'":
            return True
        return False

    @staticmethod
    def _supports_no_thinking(model: str) -> bool:
        lowered = model.lower()
        return "2.5" in lowered and "flash" in lowered and "thinking" not in lowered

    @staticmethod
    def _get_temperature(creativity: str) -> float:
        return CREATIVITY_TEMPERATURES.get(creativity, CREATIVITY_TEMPERATURES["balanced"])

    @staticmethod
    def _get_model_max_output_tokens(model: str) -> int:
        lowered = model.lower()
        if "2.5" in lowered:
            return 65536
        if "2.0" in lowered:
            return 8192
        return 8192

    def _get_write_max_output_tokens(self, write_length: str, model: str) -> int:
        requested = WRITE_LENGTH_TOKEN_TARGETS.get(write_length, WRITE_LENGTH_TOKEN_TARGETS["medium"])
        return min(requested, self._get_model_max_output_tokens(model))

    @staticmethod
    def _compress_instruction(custom_prompt: str) -> str:
        trimmed = custom_prompt.strip()
        if not trimmed or len(trimmed) <= 150:
            return trimmed

        rules = [part.strip() for part in re.split(r"[，。;\n]", trimmed) if part.strip()]
        compressed = ""
        for rule in rules:
            if len(compressed) + len(rule) > 140:
                break
            compressed = f"{compressed}；{rule}" if compressed else rule
        return compressed or (trimmed[:140] + "…")

    @staticmethod
    def _budget_truncate(text: str, max_tokens: int) -> str:
        max_chars = int(max_tokens * 1.8)
        if len(text) <= max_chars:
            return text

        cut = text[:max_chars]
        last_punct = max(cut.rfind("。"), cut.rfind("！"), cut.rfind("？"))
        if last_punct > max_chars * 0.6:
            return cut[: last_punct + 1] + "…"
        return cut + "…"

    def _build_system_instruction(self, style: str, custom_prompt: str) -> str:
        prompt = STYLE_PROMPTS.get(style, STYLE_PROMPTS["romance"])
        compressed = self._compress_instruction(custom_prompt)
        lines = [
            f"你是一位卓越的中文小说作家，请{prompt}续写正文。",
            "输出规则：①直接输出正文，无标题无说明；②不重复已有内容；③保持人称、视角、时态不变；④到字数上限立即停笔。",
        ]
        if compressed:
            lines.append(f"写作风格：{compressed}")
        return "\n".join(lines)

    def _build_polish_system_instruction(self, style: str, custom_prompt: str, mode: PolishMode) -> str:
        lines = list(POLISH_MODE_INSTRUCTIONS.get(mode, POLISH_MODE_INSTRUCTIONS["standard"]))
        compressed = self._compress_instruction(custom_prompt)
        prompt = STYLE_PROMPTS.get(style, STYLE_PROMPTS["romance"])
        if compressed and mode != "anti-detect":
            lines.append(f"写作风格：{prompt}；{compressed}")
        elif mode != "anti-detect":
            lines.append(f"写作风格：{prompt}")
        return "\n".join(lines)

    def _build_continue_user_message(
        self,
        *,
        text: str,
        write_length: str,
        one_time_prompt: str,
        memory_context: str,
        compact_summary: str,
        prev_chapter_tail: str,
        style_block: str,
        version_angle: str | None,
    ) -> str:
        word_target = WRITE_LENGTH_WORD_TARGETS.get(write_length, WRITE_LENGTH_WORD_TARGETS["medium"])
        sections = [f"<约束>续写 {word_target} 字以内</约束>"]
        background_parts: list[str] = []

        if memory_context.strip():
            background_parts.append(self._budget_truncate(memory_context.strip(), 600))
        if compact_summary.strip():
            background_parts.append(self._budget_truncate(compact_summary.strip(), 300))
        if style_block.strip():
            background_parts.append(self._budget_truncate(style_block.strip(), 150))
        if one_time_prompt.strip():
            background_parts.append(f"<本次指令>{self._budget_truncate(one_time_prompt.strip(), 80)}</本次指令>")
        if version_angle and version_angle.strip():
            background_parts.append(f"<写作角度>{self._budget_truncate(version_angle.strip(), 50)}</写作角度>")

        if background_parts:
            sections.append("<背景>\n" + "\n".join(background_parts) + "\n</背景>")

        previous_parts: list[str] = []
        if prev_chapter_tail.strip():
            previous_parts.append(
                "<前章结尾（仅背景，勿重复）>"
                + self._budget_truncate(prev_chapter_tail.strip(), 150)
                + "</前章结尾（仅背景，勿重复）>"
            )
        previous_parts.append(f"<正文末尾>\n{text[-CONTEXT_TAIL_CHARS:]}\n</正文末尾>")
        sections.append("<前文>\n" + "\n".join(previous_parts) + "\n</前文>")
        return "<续写>\n" + "\n".join(sections) + "\n</续写>"

    def _build_polish_dynamic_block(
        self,
        text: str,
        one_time_prompt: str,
        memory_context: str,
        mode: PolishMode,
    ) -> str:
        char_count = len(re.sub(r"\s+", "", text))
        task_labels = {
            "standard": f"润色以下文字（修正病句、优化措辞、增强文学性），输出字数不超过原文 110%（原文 {char_count} 字）。",
            "spot-fix": f"校对以下文字（仅修错别字和语法），保留原文风格，输出字数与原文接近（原文 {char_count} 字）。",
            "rewrite": f"重写以下文字（保留情节，全新句式），输出字数与原文相当（原文 {char_count} 字）。",
            "rework": f"重构以下文字的段落结构与叙事节奏，输出字数与原文相当（原文 {char_count} 字），不得删减核心情节。",
            "anti-detect": f"对以下文字进行去 AI 化处理，输出字数与原文相当（原文 {char_count} 字），不得删减任何内容。",
        }
        parts = [task_labels.get(mode, task_labels["standard"])]
        if memory_context.strip() and mode != "spot-fix":
            parts.append(self._budget_truncate(memory_context.strip(), 400))
        if one_time_prompt.strip():
            parts.append(f"<本次要求>{self._budget_truncate(one_time_prompt.strip(), 80)}</本次要求>")
        parts.append(f"<原文>\n{text}\n</原文>")
        return "\n".join(parts)

    @staticmethod
    def _split_compact_summary(memory_context: str) -> tuple[str, str]:
        match = re.search(r"<compact_summary>[\s\S]*?</compact_summary>", memory_context)
        if not match:
            return memory_context, ""
        compact_summary = match.group(0)
        memory_only = memory_context.replace(compact_summary, "").strip()
        return memory_only, compact_summary

    @staticmethod
    def _split_into_polish_chunks(text: str, max_chars: int) -> list[str]:
        paragraphs = [line.rstrip() for line in text.split("\n")]
        chunks: list[str] = []
        current: list[str] = []
        current_len = 0

        for paragraph in paragraphs:
            paragraph_len = len(re.sub(r"\s+", "", paragraph))
            if current_len + paragraph_len > max_chars and current:
                chunks.append("\n".join(current))
                current = []
                current_len = 0
            current.append(paragraph)
            current_len += paragraph_len

        if current:
            chunks.append("\n".join(current))
        return chunks
