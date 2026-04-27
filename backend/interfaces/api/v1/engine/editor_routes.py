"""Editor routes for inline continuation and rewrite tasks."""
from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from application.engine.services.chapter_generation_service import (
    ChapterEntityExtractRequest,
    ChapterExtractRequest,
    ChapterGenerationService,
    ChapterSummaryRequest,
    OutlineRequest,
)
from application.engine.services.editor_generation_service import (
    ContinueRequest,
    EditorGenerationService,
    ExplainRequest,
    PolishRequest,
    ProviderConfig,
    ResumeRequest,
    RewriteRequest,
)

router = APIRouter(prefix="/editor", tags=["editor"])
editor_service = EditorGenerationService()
chapter_service = ChapterGenerationService()


class ProviderPayload(BaseModel):
    api_key: str = Field(..., min_length=1, description="模型 API Key")
    model: str = Field(..., min_length=1, description="模型名称")
    provider: str | None = Field(default=None, description="可选：gemini/openai/anthropic")
    base_url: str | None = Field(default=None, description="兼容网关地址")


class EditorConfigPayload(BaseModel):
    style: str = Field(default="romance")
    custom_prompt: str = Field(default="")
    creativity: str = Field(default="balanced")
    write_length: str = Field(default="medium")


class ContinueStreamPayload(ProviderPayload, EditorConfigPayload):
    content: str = Field(..., min_length=1)
    one_time_prompt: str = Field(default="")
    memory_context: str = Field(default="")
    prev_chapter_tail: str = Field(default="")
    style_block: str = Field(default="")
    version_angle: str | None = Field(default=None)
    temperature_override: float | None = Field(default=None)


class ResumeStreamPayload(ProviderPayload):
    creativity: str = Field(default="balanced")
    write_length: str = Field(default="medium")
    original_text: str = Field(..., min_length=1)
    truncated_part: str = Field(..., min_length=1)


class PolishPayload(ProviderPayload):
    style: str = Field(default="romance")
    custom_prompt: str = Field(default="")
    text: str = Field(..., min_length=1)
    one_time_prompt: str = Field(default="")
    memory_context: str = Field(default="")
    mode: str = Field(default="standard")


class RewritePayload(ProviderPayload):
    text: str = Field(..., min_length=1)
    angle: str = Field(..., min_length=1)
    memory_context: str = Field(default="")


class ExplainPayload(ProviderPayload):
    text: str = Field(..., min_length=1)


class TextResponse(BaseModel):
    text: str


class ChapterSummaryPayload(ProviderPayload):
    chapter_title: str = Field(default="")
    content: str = Field(..., min_length=1)


class ChapterExtractPayload(ProviderPayload):
    chapter_title: str = Field(default="")
    content: str = Field(..., min_length=1)
    known_entity_names: list[str] = Field(default_factory=list)


class OutlinePayload(ProviderPayload):
    synopsis: str = Field(..., min_length=1)
    existing_chapter_count: int = Field(default=0, ge=0)


class OutlineCardResponse(BaseModel):
    title: str
    synopsis: str


class ExtractedMemoryItemResponse(BaseModel):
    type: str
    name: str
    content: str


class GraphEntityResponse(BaseModel):
    name: str
    type: str
    attributes: dict[str, str] = Field(default_factory=dict)
    observations: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)


class GraphRelationResponse(BaseModel):
    from_: str = Field(alias="from")
    to: str
    relationType: str
    weight: float | None = None
    notes: str | None = None

    model_config = {
        "populate_by_name": True,
    }


class ChapterExtractResponse(BaseModel):
    memories: list[ExtractedMemoryItemResponse] = Field(default_factory=list)
    graphEntities: list[GraphEntityResponse] = Field(default_factory=list)
    graphRelations: list[GraphRelationResponse] = Field(default_factory=list)


def _provider_from_payload(payload: ProviderPayload) -> ProviderConfig:
    provider = editor_service.infer_provider(payload.model, payload.provider, payload.base_url)
    return ProviderConfig(
        api_key=payload.api_key,
        model=payload.model,
        provider=provider,
        base_url=payload.base_url,
    )


def _sse_event(payload: dict[str, object]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


@router.post(
    "/continue-stream",
    status_code=status.HTTP_200_OK,
)
async def continue_stream(request: ContinueStreamPayload):
    async def event_stream():
        try:
            service_request = ContinueRequest(
                provider=_provider_from_payload(request),
                style=request.style,
                custom_prompt=request.custom_prompt,
                creativity=request.creativity,
                write_length=request.write_length,
                content=request.content,
                one_time_prompt=request.one_time_prompt,
                memory_context=request.memory_context,
                prev_chapter_tail=request.prev_chapter_tail,
                style_block=request.style_block,
                version_angle=request.version_angle,
                temperature_override=request.temperature_override,
            )
            async for event in editor_service.stream_continue(service_request):
                yield _sse_event(event)
        except Exception as exc:  # pragma: no cover - SSE path
            yield _sse_event({"type": "error", "message": str(exc)})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post(
    "/resume-stream",
    status_code=status.HTTP_200_OK,
)
async def resume_stream(request: ResumeStreamPayload):
    async def event_stream():
        try:
            service_request = ResumeRequest(
                provider=_provider_from_payload(request),
                creativity=request.creativity,
                write_length=request.write_length,
                original_text=request.original_text,
                truncated_part=request.truncated_part,
            )
            async for event in editor_service.stream_resume(service_request):
                yield _sse_event(event)
        except Exception as exc:  # pragma: no cover - SSE path
            yield _sse_event({"type": "error", "message": str(exc)})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post(
    "/polish",
    response_model=TextResponse,
    status_code=status.HTTP_200_OK,
)
async def polish_text(request: PolishPayload):
    try:
        text = await editor_service.polish_text(
            PolishRequest(
                provider=_provider_from_payload(request),
                style=request.style,
                custom_prompt=request.custom_prompt,
                text=request.text,
                one_time_prompt=request.one_time_prompt,
                memory_context=request.memory_context,
                mode=request.mode,  # type: ignore[arg-type]
            )
        )
        return TextResponse(text=text)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc


@router.post(
    "/rewrite",
    response_model=TextResponse,
    status_code=status.HTTP_200_OK,
)
async def rewrite_text(request: RewritePayload):
    try:
        text = await editor_service.rewrite_text(
            RewriteRequest(
                provider=_provider_from_payload(request),
                text=request.text,
                angle=request.angle,  # type: ignore[arg-type]
                memory_context=request.memory_context,
            )
        )
        return TextResponse(text=text)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc


@router.post(
    "/explain",
    response_model=TextResponse,
    status_code=status.HTTP_200_OK,
)
async def explain_text(request: ExplainPayload):
    try:
        text = await editor_service.explain_text(
            ExplainRequest(
                provider=_provider_from_payload(request),
                text=request.text,
            )
        )
        return TextResponse(text=text)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc


@router.post(
    "/chapter-summary",
    response_model=TextResponse,
    status_code=status.HTTP_200_OK,
)
async def chapter_summary(request: ChapterSummaryPayload):
    try:
        text = await chapter_service.generate_chapter_summary(
            ChapterSummaryRequest(
                provider=_provider_from_payload(request),
                chapter_title=request.chapter_title,
                content=request.content,
            )
        )
        return TextResponse(text=text)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc


@router.post(
    "/chapter-extract-all",
    response_model=ChapterExtractResponse,
    status_code=status.HTTP_200_OK,
)
async def chapter_extract_all(request: ChapterExtractPayload):
    try:
        data = await chapter_service.extract_chapter_all(
            ChapterExtractRequest(
                provider=_provider_from_payload(request),
                chapter_title=request.chapter_title,
                content=request.content,
                known_entity_names=request.known_entity_names,
            )
        )
        return ChapterExtractResponse(**data)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc


@router.post(
    "/chapter-extract-entities",
    response_model=list[ExtractedMemoryItemResponse],
    status_code=status.HTTP_200_OK,
)
async def chapter_extract_entities(request: ChapterSummaryPayload):
    try:
        return await chapter_service.extract_chapter_entities(
            ChapterEntityExtractRequest(
                provider=_provider_from_payload(request),
                chapter_title=request.chapter_title,
                content=request.content,
            )
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc


@router.post(
    "/outline",
    response_model=list[OutlineCardResponse],
    status_code=status.HTTP_200_OK,
)
async def generate_outline(request: OutlinePayload):
    try:
        return await chapter_service.generate_outline(
            OutlineRequest(
                provider=_provider_from_payload(request),
                synopsis=request.synopsis,
                existing_chapter_count=request.existing_chapter_count,
            )
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc
