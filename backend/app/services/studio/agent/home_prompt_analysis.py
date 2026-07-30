from __future__ import annotations

import asyncio
import json
import re
import uuid
from dataclasses import dataclass
from typing import Any, Protocol

from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import async_session_maker
from app.models.studio import (
    AgentAction,
    AgentArtifact,
    AgentCheckpoint,
    AgentMessage,
    AgentSession,
    Project,
)
from app.models.types import (
    AgentActionStatus,
    AgentActionType,
    AgentArtifactKind,
    AgentArtifactStatus,
    AgentCheckpointStatus,
    AgentMessageKind,
    AgentMessageRole,
    AgentSessionStage,
    AgentSessionStatus,
    ProjectStyle,
    ProjectVisualStyle,
)
from app.services.llm.resolver import build_default_text_llm


ANALYSIS_PENDING_TITLE = "正在分析剧情…"
ANALYSIS_FAILED_LABEL = "分析失败，可重试"


@dataclass(frozen=True)
class HomePromptAnalysis:
    title: str
    story_summary: str
    final_video_spec: dict[str, Any]


@dataclass(frozen=True)
class HomePromptProjectCreated:
    project_id: str
    session_id: str
    action_id: str
    status: str


class HomePromptAnalyzer(Protocol):
    async def analyze(self, *, prompt: str, skill_key: str) -> HomePromptAnalysis:
        """把首页自然语言分析成标题、故事摘要和规格初稿。"""


class LLMHomePromptAnalyzer:
    """生产分析器：让文本模型只输出结构化 JSON，落库前再由代码校验和兜底。"""

    def __init__(self, llm: Any) -> None:
        self._llm = llm

    async def analyze(self, *, prompt: str, skill_key: str) -> HomePromptAnalysis:
        messages = [
            SystemMessage(
                content=(
                    "你是 Flova 式视频创作工作台的首页剧情分析器。"
                    "只输出 JSON，不要 Markdown。字段：title, story_summary, final_video_spec。"
                    "title 必须是对剧情/需求的总结标题，不得直接截取输入第一句。"
                    "story_summary 用中文概括主要人物、冲突、目标、情绪基调和视频方向。"
                    "final_video_spec 至少包含 output_language, aspect_ratio, visual_style, genre, duration_hint。"
                )
            ),
            HumanMessage(content=f"skill_key={skill_key}\n用户输入：\n{prompt}"),
        ]
        response = await asyncio.wait_for(self._llm.ainvoke(messages), timeout=45)
        content = getattr(response, "content", response)
        if not isinstance(content, str):
            content = str(content)
        payload = _parse_json_object(content)
        title = _clean_title(str(payload.get("title") or ""))
        story_summary = str(payload.get("story_summary") or "").strip()
        spec = payload.get("final_video_spec")
        if not isinstance(spec, dict):
            spec = {}
        if not title or not story_summary:
            raise ValueError("LLM analysis missing title or story_summary")
        return HomePromptAnalysis(
            title=title,
            story_summary=story_summary,
            final_video_spec=_normalize_spec(spec, skill_key=skill_key),
        )


class _FailingHomePromptAnalyzer:
    def __init__(self, error: str) -> None:
        self._error = error

    async def analyze(self, *, prompt: str, skill_key: str) -> HomePromptAnalysis:
        raise RuntimeError(self._error)


async def create_home_project_from_prompt(
    db: AsyncSession,
    *,
    prompt: str,
    skill_key: str,
    idempotency_key: str,
) -> HomePromptProjectCreated:
    """创建项目、Agent session 和分析 action；同一幂等键重复请求直接返回既有记录。"""

    existing_action = await _get_action_by_idempotency_key(db, idempotency_key)
    if existing_action is not None:
        return HomePromptProjectCreated(
            project_id=existing_action.project_id,
            session_id=existing_action.session_id,
            action_id=existing_action.id,
            status=existing_action.status.value if hasattr(existing_action.status, "value") else str(existing_action.status),
        )

    project_id = _new_id("proj")
    session_id = _new_id("agent_session")
    action_id = _new_id("agent_action")
    requested_at = func.now()
    project = Project(
        id=project_id,
        name=ANALYSIS_PENDING_TITLE,
        description=f"技能：{skill_key}\n\n{prompt.strip()}",
        style=ProjectStyle.real_people_city,
        visual_style=ProjectVisualStyle.live_action,
        seed=0,
        unify_style=True,
        progress=2,
        default_video_ratio=_default_ratio_for_skill(skill_key),
        stats={
            "created_from": "flova_home_prompt",
            "selected_skill": skill_key,
            "source_prompt": prompt.strip(),
            "agent_analysis_status": "pending",
            "agent_analysis_title_source": "llm_pending",
        },
    )
    session = AgentSession(
        id=session_id,
        project_id=project_id,
        current_stage=AgentSessionStage.intake,
        status=AgentSessionStatus.running,
        revision=0,
        state={
            "source": "home_prompt",
            "selected_skill": skill_key,
            "analysis_status": "pending",
        },
    )
    message = AgentMessage(
        id=_new_id("agent_message"),
        session_id=session_id,
        sequence=1,
        role=AgentMessageRole.assistant,
        kind=AgentMessageKind.task_update,
        content=ANALYSIS_PENDING_TITLE,
        payload={"status": "pending", "requested_at": str(requested_at)},
    )
    action = AgentAction(
        id=action_id,
        session_id=session_id,
        project_id=project_id,
        message_id=message.id,
        action_type=AgentActionType.analyze,
        target_type="project",
        target_id=project_id,
        idempotency_key=idempotency_key,
        status=AgentActionStatus.running,
        input={"prompt": prompt.strip(), "skill_key": skill_key},
    )
    db.add(project)
    await db.flush()
    db.add(session)
    await db.flush()
    db.add(message)
    await db.flush()
    db.add(action)
    await db.flush()
    return HomePromptProjectCreated(
        project_id=project_id,
        session_id=session_id,
        action_id=action_id,
        status=AgentActionStatus.running.value,
    )


async def run_home_prompt_analysis(
    db: AsyncSession,
    *,
    action_id: str,
    analyzer: HomePromptAnalyzer,
) -> None:
    """执行首页真分析；成功写摘要和规格问题卡，失败保留项目并显式标记可重试。"""

    action = await db.get(AgentAction, action_id)
    if action is None:
        return
    project = await db.get(Project, action.project_id)
    session = await db.get(AgentSession, action.session_id)
    if project is None or session is None:
        return

    prompt = str((action.input or {}).get("prompt") or "")
    skill_key = str((action.input or {}).get("skill_key") or "short_drama")
    try:
        analysis = await analyzer.analyze(prompt=prompt, skill_key=skill_key)
    except Exception as exc:  # noqa: BLE001
        _mark_analysis_failed(project=project, session=session, action=action, prompt=prompt, error=str(exc))
        await _append_message(
            db,
            session_id=session.id,
            role=AgentMessageRole.assistant,
            kind=AgentMessageKind.error,
            content=f"{ANALYSIS_FAILED_LABEL}。项目已保留，可以稍后重试剧情分析。",
            payload={"error": str(exc), "status": "failed_retryable"},
        )
        await db.flush()
        return

    summary_message = await _append_message(
        db,
        session_id=session.id,
        role=AgentMessageRole.assistant,
        kind=AgentMessageKind.text,
        content=analysis.story_summary,
        payload={"artifact_kind": AgentArtifactKind.story_summary.value},
    )
    await db.flush()
    artifact = AgentArtifact(
        id=_new_id("agent_artifact"),
        project_id=project.id,
        kind=AgentArtifactKind.story_summary,
        version=1,
        status=AgentArtifactStatus.confirmed,
        content_text=analysis.story_summary,
        content_json={
            "title": analysis.title,
            "summary": analysis.story_summary,
            "final_video_spec": analysis.final_video_spec,
            "skill_key": skill_key,
        },
        created_by_message_id=summary_message.id,
    )
    db.add(artifact)
    question_message = await _append_message(
        db,
        session_id=session.id,
        role=AgentMessageRole.assistant,
        kind=AgentMessageKind.question_card,
        content="请确认成片规格，确认后我会进入拆分镜阶段。",
        payload={"question_card_kind": "final_video_spec", "final_video_spec": analysis.final_video_spec},
    )
    await db.flush()
    checkpoint = AgentCheckpoint(
        id=_new_id("agent_checkpoint"),
        session_id=session.id,
        stage=AgentSessionStage.spec_review,
        status=AgentCheckpointStatus.pending,
        question="请确认成片规格，确认后我会进入拆分镜阶段。",
        options=_build_spec_question_options(analysis.final_video_spec),
        message_id=question_message.id,
    )
    db.add(checkpoint)

    project.name = analysis.title
    project.progress = max(project.progress or 0, 12)
    project.stats = {
        **(project.stats or {}),
        "agent_analysis_status": "succeeded",
        "agent_analysis_title_source": "llm_summary",
        "agent_summary_title": analysis.title,
        "story_summary_artifact_id": artifact.id,
        "final_video_spec": analysis.final_video_spec,
    }
    session.current_stage = AgentSessionStage.spec_review
    session.status = AgentSessionStatus.waiting_user
    session.revision = (session.revision or 0) + 1
    session.state = {
        **(session.state or {}),
        "analysis_status": "succeeded",
        "confirmed_stages": [AgentSessionStage.intake.value],
        "pending_stage": AgentSessionStage.spec_review.value,
        "story_summary_artifact_id": artifact.id,
        "final_video_spec": analysis.final_video_spec,
    }
    action.status = AgentActionStatus.succeeded
    action.output = {
        "title": analysis.title,
        "story_summary_artifact_id": artifact.id,
        "checkpoint_id": checkpoint.id,
    }
    action.error = ""
    await db.flush()


async def run_home_prompt_analysis_task(action_id: str) -> None:
    """BackgroundTasks 入口：独立打开 DB session，避免复用请求结束后的会话。"""

    async with async_session_maker() as db:
        try:
            llm = await asyncio.wait_for(build_default_text_llm(db, thinking=False), timeout=15)
            analyzer: HomePromptAnalyzer = LLMHomePromptAnalyzer(llm)
        except Exception as exc:  # noqa: BLE001
            analyzer = _FailingHomePromptAnalyzer(str(exc))
        await run_home_prompt_analysis(db, action_id=action_id, analyzer=analyzer)
        await db.commit()


def _parse_json_object(content: str) -> dict[str, Any]:
    text = content.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("LLM analysis is not JSON")
    parsed = json.loads(text[start : end + 1])
    if not isinstance(parsed, dict):
        raise ValueError("LLM analysis JSON must be an object")
    return parsed


def _normalize_spec(spec: dict[str, Any], *, skill_key: str) -> dict[str, Any]:
    normalized = dict(spec)
    normalized.setdefault("output_language", "中文")
    normalized.setdefault("aspect_ratio", _default_ratio_for_skill(skill_key))
    normalized.setdefault("visual_style", "现实短剧")
    normalized.setdefault("genre", _genre_for_skill(skill_key))
    normalized.setdefault("duration_hint", _duration_hint_for_skill(skill_key))
    return normalized


def _clean_title(title: str) -> str:
    cleaned = re.sub(r"\s+", " ", title).strip(" \n\t。.!！")
    return cleaned[:60]


def _fallback_title(prompt: str) -> str:
    cleaned = re.sub(r"\s+", " ", prompt).strip()
    first_clause = re.split(r"[，。！？,.!?；;]", cleaned)[0].strip()
    if len(first_clause) >= 4:
        return (first_clause[:18] + "...") if len(first_clause) > 18 else first_clause
    return "未命名视频项目"


def _mark_analysis_failed(
    *,
    project: Project,
    session: AgentSession,
    action: AgentAction,
    prompt: str,
    error: str,
) -> None:
    project.name = f"{_fallback_title(prompt)}（{ANALYSIS_FAILED_LABEL}）"
    project.progress = max(project.progress or 0, 2)
    project.stats = {
        **(project.stats or {}),
        "agent_analysis_status": "failed_retryable",
        "agent_analysis_label": ANALYSIS_FAILED_LABEL,
        "agent_analysis_error": error,
        "agent_analysis_title_source": "local_fallback_after_failure",
    }
    session.status = AgentSessionStatus.failed
    session.revision = (session.revision or 0) + 1
    session.state = {
        **(session.state or {}),
        "analysis_status": "failed_retryable",
        "analysis_label": ANALYSIS_FAILED_LABEL,
        "analysis_error": error,
    }
    action.status = AgentActionStatus.failed
    action.error = error
    action.output = {"status": "failed_retryable", "label": ANALYSIS_FAILED_LABEL}


async def _append_message(
    db: AsyncSession,
    *,
    session_id: str,
    role: AgentMessageRole,
    kind: AgentMessageKind,
    content: str,
    payload: dict[str, Any],
) -> AgentMessage:
    next_sequence = await _next_message_sequence(db, session_id)
    message = AgentMessage(
        id=_new_id("agent_message"),
        session_id=session_id,
        sequence=next_sequence,
        role=role,
        kind=kind,
        content=content,
        payload=payload,
    )
    db.add(message)
    return message


async def _next_message_sequence(db: AsyncSession, session_id: str) -> int:
    result = await db.execute(select(func.max(AgentMessage.sequence)).where(AgentMessage.session_id == session_id))
    current = result.scalar_one_or_none() or 0
    return int(current) + 1


async def _get_action_by_idempotency_key(db: AsyncSession, idempotency_key: str) -> AgentAction | None:
    result = await db.execute(select(AgentAction).where(AgentAction.idempotency_key == idempotency_key))
    return result.scalar_one_or_none()


def _build_spec_question_options(spec: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "id": "confirm_final_video_spec",
            "label": "确认规格",
            "effect": "confirm_and_advance",
            "payload": {"final_video_spec": spec},
        },
        {
            "id": "revise_final_video_spec",
            "label": "调整规格",
            "effect": "stay_and_collect_feedback",
            "payload": {"target": "final_video_spec"},
        },
        {
            "id": "pause_before_storyboard",
            "label": "先暂停",
            "effect": "stay_and_collect_feedback",
            "payload": {"stage": AgentSessionStage.spec_review.value},
        },
    ]


def _default_ratio_for_skill(skill_key: str) -> str:
    return {
        "long_video": "16:9",
        "commercial": "1:1",
        "short_drama": "16:9",
    }.get(skill_key, "16:9")


def _genre_for_skill(skill_key: str) -> str:
    return {
        "long_video": "长视频",
        "commercial": "商业广告",
        "short_drama": "短剧",
    }.get(skill_key, "短剧")


def _duration_hint_for_skill(skill_key: str) -> str:
    return {
        "long_video": "3-10分钟",
        "commercial": "15-60秒",
        "short_drama": "30-90秒",
    }.get(skill_key, "30-90秒")


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"
