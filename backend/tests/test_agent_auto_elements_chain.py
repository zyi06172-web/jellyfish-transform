from __future__ import annotations

from sqlalchemy import event, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401
from app.core.db import Base
from app.models.studio import AgentMessage, AgentSession, Character, Project, ProjectPropLink, ProjectSceneLink, Prop, Scene
from app.models.task import GenerationDeliveryMode, GenerationTask, GenerationTaskStatus
from app.models.types import (
    AgentMessageKind,
    AgentSessionStage,
    AgentSessionStatus,
    ProjectStyle,
    ProjectVisualStyle,
)
from app.services.script_processing_tasks import SCRIPT_DIVIDE_TASK_KIND, SCRIPT_EXTRACT_TASK_KIND
from app.services.studio.agent.auto_elements_chain import (
    AutoElementsServices,
    ElementImageTarget,
    _collect_element_image_targets,
    execute_agent_auto_elements_chain,
)
from app.services.studio.agent.prompt_synthesizer import ImagePromptRequest


async def _build_session() -> tuple[AsyncSession, object]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)

    @event.listens_for(engine.sync_engine, "connect")
    def _enable_foreign_keys(dbapi_connection, _connection_record) -> None:  # noqa: ANN001
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_local = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    return session_local(), engine


async def _seed_storyboard_session(db: AsyncSession) -> None:
    project = Project(
        id="proj-phase6",
        name="雨夜追证",
        description="女主在雨夜发现关键证据并反转。",
        style=ProjectStyle.real_people_city,
        visual_style=ProjectVisualStyle.live_action,
        seed=0,
        unify_style=True,
        progress=20,
        default_video_ratio="9:16",
        stats={
            "source_prompt": "女主在雨夜发现关键证据并反转。",
            "final_video_spec": {"output_language": "中文", "visual_style": "现实短剧", "aspect_ratio": "9:16"},
        },
    )
    session = AgentSession(
        id="session-phase6",
        project_id=project.id,
        current_stage=AgentSessionStage.storyboard,
        status=AgentSessionStatus.active,
        revision=2,
        state={"confirmed_stages": ["intake", "spec_review"], "completed_stages": []},
    )
    db.add(project)
    await db.flush()
    db.add(session)
    await db.flush()


async def test_auto_elements_chain_calls_existing_steps_in_order_and_prompts_before_image() -> None:
    db, engine = await _build_session()
    calls: list[str] = []
    try:
        await _seed_storyboard_session(db)

        async def fake_run_task(db: AsyncSession, task_kind: str, task_id: str) -> None:
            calls.append(task_kind)
            task = await db.get(GenerationTask, task_id)
            assert task is not None
            task.status = GenerationTaskStatus.succeeded
            task.progress = 100
            if task_kind == SCRIPT_DIVIDE_TASK_KIND:
                task.result = {"shots": [{"index": 1, "summary": "雨夜发现证据"}]}
            else:
                task.result = {"draft": {"shot_count": 1}, "from_cache": False}
            await db.flush()

        async def fake_l3(db: AsyncSession, chapter_id: str) -> dict:
            calls.append("l3")
            project = await db.get(Project, "proj-phase6")
            assert project is not None
            db.add(
                Character(
                    id="char-heroine",
                    project_id=project.id,
                    name="女主",
                    description="敏锐坚定的都市女主，黑色风衣。",
                    style=project.style,
                    visual_style=project.visual_style,
                    actor_id=None,
                    costume_id=None,
                )
            )
            db.add(
                Scene(
                    id="scene-banquet",
                    name="婚礼宴会厅",
                    description="暖金吊灯与冷白追光交错的酒店婚礼宴会厅。",
                    style=project.style,
                    visual_style=project.visual_style,
                )
            )
            await db.flush()
            db.add(ProjectSceneLink(project_id=project.id, scene_id="scene-banquet", chapter_id=None, shot_id=None))
            await db.flush()
            return {"chapter_id": chapter_id, "level": "L3", "created_and_linked": 1}

        async def fake_prompt(_db: AsyncSession, request: ImagePromptRequest) -> str:
            calls.append("prompt")
            assert request.final_video_spec.aspect_ratio == "9:16"
            if request.element.kind == "character":
                return "女主角色参考图，左脸近景 + 右全身，9:16，无画面文字。"
            assert request.element.kind == "scene"
            return "婚礼宴会厅场景参考图，9:16，无画面文字。"

        async def fake_image(_db: AsyncSession, target: ElementImageTarget, prompt: str, target_ratio: str) -> str:
            calls.append("image")
            assert target.kind in {"character", "scene"}
            assert "无画面文字" in prompt
            assert target_ratio == "9:16"
            task_id = f"image-task-{len([item for item in calls if item == 'image'])}"
            _db.add(
                GenerationTask(
                    id=task_id,
                    mode=GenerationDeliveryMode.async_polling,
                    task_kind="image_generation",
                    status=GenerationTaskStatus.succeeded,
                    progress=100,
                    payload={"run_args": {"input": {"target_ratio": "9:16"}}},
                    result={"images": [{"url": "memory://image.png"}], "target_ratio": "9:16"},
                )
            )
            await _db.flush()
            return task_id

        await execute_agent_auto_elements_chain(
            db,
            project_id="proj-phase6",
            session_id="session-phase6",
            idempotency_key="turn-confirm-spec",
            services=AutoElementsServices(
                run_task=fake_run_task,
                auto_confirm_l3=fake_l3,
                synthesize_prompt=fake_prompt,
                create_image_task=fake_image,
            ),
        )

        session = await db.get(AgentSession, "session-phase6")
        assert session is not None
        assert session.current_stage == AgentSessionStage.elements_review
        assert session.status == AgentSessionStatus.waiting_user
        assert calls == [SCRIPT_DIVIDE_TASK_KIND, SCRIPT_EXTRACT_TASK_KIND, "l3", "prompt", "image", "prompt", "image"]

        messages = (
            await db.execute(
                select(AgentMessage).where(AgentMessage.session_id == "session-phase6").order_by(AgentMessage.sequence.asc())
            )
        ).scalars().all()
        task_updates = [item for item in messages if item.kind == AgentMessageKind.task_update]
        assert len(task_updates) >= 6
        assert any("DeepSeek 拆分镜完成" in item.content for item in task_updates)
        assert any("9:16 关键元素图生成完成" in item.content for item in task_updates)
    finally:
        await db.close()
        await engine.dispose()


async def test_collect_element_targets_skips_wearable_accessory_props() -> None:
    """仅有道具 fallback 时，穿戴配饰不单独出图，独立道具仍入目标。"""

    db, engine = await _build_session()
    try:
        project = Project(
            id="proj-props",
            name="婚礼道具测试",
            description="测试穿戴配饰和独立道具分流。",
            style=ProjectStyle.real_people_city,
            visual_style=ProjectVisualStyle.live_action,
            seed=0,
            unify_style=True,
            progress=20,
            default_video_ratio="9:16",
            stats={},
        )
        brooch = Prop(
            id="prop-brooch",
            name="旧胸针",
            description="沈知夏母亲留下的旧胸针，别在婚纱胸前。",
            style=project.style,
            visual_style=project.visual_style,
        )
        bouquet = Prop(
            id="prop-bouquet",
            name="捧花",
            description="沈知夏手持的白色婚礼捧花，会单独出现在镜头里。",
            style=project.style,
            visual_style=project.visual_style,
        )
        db.add_all([project, brooch, bouquet])
        await db.flush()
        db.add_all(
            [
                ProjectPropLink(project_id=project.id, prop_id=brooch.id, chapter_id=None, shot_id=None),
                ProjectPropLink(project_id=project.id, prop_id=bouquet.id, chapter_id=None, shot_id=None),
            ]
        )
        await db.flush()

        targets = await _collect_element_image_targets(db, project_id=project.id)

        assert [target.kind for target in targets] == ["prop"]
        assert targets[0].entity_id == "prop-bouquet"
        assert targets[0].name == "捧花"
    finally:
        await db.close()
        await engine.dispose()
