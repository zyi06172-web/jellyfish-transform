"""电影手绘故事板生成服务。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.studio import (
    AgentArtifact,
    AgentArtifactKind,
    AgentArtifactStatus,
    AssetQualityLevel,
    Character,
    CharacterImage,
    Chapter,
    Scene,
    SceneImage,
    Shot,
    ShotCharacterLink,
    ShotDetail,
    ProjectSceneLink,
)
from app.models.task import GenerationTask
from app.services.studio.image_task_runner import create_image_task_and_link, run_image_generation_task
from app.services.studio.image_tasks import resolve_front_image_ref
from app.utils.files import create_file_from_url_or_b64


@dataclass(slots=True)
class StoryboardSpec:
    """手绘故事板双层数据：可见总结 + 视频模型读取的六要素。"""

    one_sentence_summary: str
    six_elements: dict[str, Any]
    prompt: str


@dataclass(slots=True)
class StoryboardGenerationResult:
    task_id: str
    file_id: str | None
    image_url: str | None
    artifact_id: str
    spec: StoryboardSpec


@dataclass(slots=True)
class StoryboardPanelSpec:
    """一页故事板中的单格：可见总结 + 视频模型读取的六要素。"""

    shot_id: str
    shot_index: int
    shot_title: str
    one_sentence_summary: str
    six_elements: dict[str, Any]


@dataclass(slots=True)
class StoryboardPageSpec:
    """章节级多格故事板页。"""

    chapter_id: str
    panel_count: int
    panels: list[StoryboardPanelSpec]
    prompt: str


@dataclass(slots=True)
class StoryboardPageGenerationResult:
    task_id: str
    file_id: str | None
    image_url: str | None
    artifact_id: str
    spec: StoryboardPageSpec


async def generate_hand_drawn_storyboard_page_for_chapter(
    db: AsyncSession,
    *,
    project_id: str,
    chapter_id: str,
    reference_character_id: str | None = None,
    reference_scene_id: str | None = None,
    run_inline: bool = False,
) -> StoryboardPageGenerationResult:
    """一次 Seedream 调用生成一页 N 格电影手绘故事板。"""

    shots = await _load_chapter_shots(db, project_id=project_id, chapter_id=chapter_id)
    if not shots:
        raise ValueError("Chapter has no shots")
    panels: list[StoryboardPanelSpec] = []
    for shot in shots:
        detail = await db.get(ShotDetail, shot.id)
        character = await _resolve_character(db, shot_id=shot.id, character_id=None)
        scene = await _resolve_scene(db, detail=detail, scene_id=None, shot_id=shot.id)
        frame_spec = build_hand_drawn_storyboard_spec(shot=shot, detail=detail, character=character, scene=scene)
        panels.append(
            StoryboardPanelSpec(
                shot_id=shot.id,
                shot_index=shot.index,
                shot_title=shot.title,
                one_sentence_summary=frame_spec.one_sentence_summary,
                six_elements=frame_spec.six_elements,
            )
        )

    reference_character = await db.get(Character, reference_character_id) if reference_character_id else await _first_project_character_with_image(db, project_id)
    reference_scene = await db.get(Scene, reference_scene_id) if reference_scene_id else await _first_chapter_scene_with_image(db, shots)
    refs = await _reference_images(db, character=reference_character, scene=reference_scene)
    spec = build_hand_drawn_storyboard_page_spec(
        chapter_id=chapter_id,
        panels=panels,
        reference_character=reference_character,
        reference_scene=reference_scene,
    )
    task_id = await create_image_task_and_link(
        db=db,
        model_id=None,
        relation_type="storyboard_page",
        relation_entity_id=chapter_id,
        prompt=spec.prompt,
        images=refs,
        target_ratio="9:16",
        resolution_profile="standard",
        purpose="video_reference",
        render_context={
            "agent_workflow": "phase_d_hand_drawn_storyboard_page",
            "project_id": project_id,
            "chapter_id": chapter_id,
            "panel_count": spec.panel_count,
            "six_elements_by_panel": [_panel_payload(panel) for panel in panels],
            "reference_character_id": reference_character.id if reference_character is not None else None,
            "reference_scene_id": reference_scene.id if reference_scene is not None else None,
        },
        enqueue=not run_inline,
    )

    file_id: str | None = None
    image_url: str | None = None
    if run_inline:
        task_row = await db.get(GenerationTask, task_id)
        payload = dict(task_row.payload or {}) if task_row is not None else {}
        run_args = dict(payload.get("run_args") or payload)
        await run_image_generation_task(task_id, run_args)
        await db.rollback()
        task_row = await db.get(GenerationTask, task_id)
        result = dict(task_row.result or {}) if task_row is not None else {}
        images = result.get("images") if isinstance(result.get("images"), list) else []
        first = images[0] if images and isinstance(images[0], dict) else {}
        image_url = str(first.get("url") or "") or None
        b64_json = str(first.get("b64_json") or "") or None
        if image_url or b64_json:
            file_obj = await create_file_from_url_or_b64(
                db,
                url=image_url,
                b64_data=b64_json,
                name=f"storyboard-page-{chapter_id}",
                prefix=f"generated-storyboards/{project_id}/{chapter_id}",
            )
            file_id = file_obj.id

    artifact = await _upsert_storyboard_page_artifact(
        db,
        project_id=project_id,
        chapter_id=chapter_id,
        task_id=task_id,
        file_id=file_id,
        image_url=image_url,
        spec=spec,
    )
    await db.commit()
    return StoryboardPageGenerationResult(task_id=task_id, file_id=file_id, image_url=image_url, artifact_id=artifact.id, spec=spec)


async def generate_hand_drawn_storyboard_for_shot(
    db: AsyncSession,
    *,
    project_id: str,
    shot_id: str,
    character_id: str | None = None,
    scene_id: str | None = None,
    run_inline: bool = False,
) -> StoryboardGenerationResult:
    """为单个镜头生成 9:16 手绘故事板图，并写入 storyboard artifact。"""

    shot = await _load_project_shot(db, project_id=project_id, shot_id=shot_id)
    detail = await db.get(ShotDetail, shot_id)
    character = await _resolve_character(db, shot_id=shot_id, character_id=character_id)
    scene = await _resolve_scene(db, detail=detail, scene_id=scene_id, shot_id=shot_id)
    spec = build_hand_drawn_storyboard_spec(shot=shot, detail=detail, character=character, scene=scene)
    refs = await _reference_images(db, character=character, scene=scene)

    task_id = await create_image_task_and_link(
        db=db,
        model_id=None,
        relation_type="storyboard_frame",
        relation_entity_id=shot_id,
        prompt=spec.prompt,
        images=refs,
        target_ratio="9:16",
        resolution_profile="standard",
        purpose="video_reference",
        render_context={
            "agent_workflow": "phase_d_hand_drawn_storyboard",
            "project_id": project_id,
            "shot_id": shot_id,
            "visible_summary": spec.one_sentence_summary,
            "six_elements": spec.six_elements,
            "reference_character_id": character.id if character is not None else None,
            "reference_scene_id": scene.id if scene is not None else None,
        },
        enqueue=not run_inline,
    )

    file_id: str | None = None
    image_url: str | None = None
    if run_inline:
        task_row = await db.get(GenerationTask, task_id)
        payload = dict(task_row.payload or {}) if task_row is not None else {}
        run_args = dict(payload.get("run_args") or payload)
        await run_image_generation_task(task_id, run_args)
        await db.rollback()
        task_row = await db.get(GenerationTask, task_id)
        result = dict(task_row.result or {}) if task_row is not None else {}
        images = result.get("images") if isinstance(result.get("images"), list) else []
        first = images[0] if images and isinstance(images[0], dict) else {}
        image_url = str(first.get("url") or "") or None
        b64_json = str(first.get("b64_json") or "") or None
        if image_url or b64_json:
            file_obj = await create_file_from_url_or_b64(
                db,
                url=image_url,
                b64_data=b64_json,
                name=f"storyboard-{shot_id}",
                prefix=f"generated-storyboards/{project_id}/{shot_id}",
            )
            file_id = file_obj.id

    artifact = await _upsert_storyboard_artifact(
        db,
        project_id=project_id,
        shot_id=shot_id,
        task_id=task_id,
        file_id=file_id,
        image_url=image_url,
        spec=spec,
    )
    await db.commit()
    return StoryboardGenerationResult(task_id=task_id, file_id=file_id, image_url=image_url, artifact_id=artifact.id, spec=spec)


def build_hand_drawn_storyboard_spec(
    *,
    shot: Shot,
    detail: ShotDetail | None,
    character: Character | None,
    scene: Scene | None,
) -> StoryboardSpec:
    """确定性构建故事板可见总结、六要素和出图提示词。"""

    character_name = _storyboard_subject_name(shot=shot, detail=detail, character=character)
    scene_name = scene.name if scene is not None else "当前场景"
    action_beats = list(detail.action_beats or []) if detail is not None else []
    movement = _enum_value(detail.movement) if detail is not None else "TRACK"
    camera_shot = _enum_value(detail.camera_shot) if detail is not None else "MS"
    lighting = detail.atmosphere if detail is not None and detail.atmosphere else "冷白追光与宴会厅暖光形成对比"
    action_process = "；".join(action_beats) or shot.script_excerpt or shot.title

    one_sentence = _one_sentence_summary(
        scene_name=scene_name,
        character_name=character_name,
        shot=shot,
        action_process=action_process,
    )
    six_elements = {
        "subject": {
            "value": character_name,
            "motion_process": action_process,
        },
        "scene": {
            "value": scene_name,
            "motion_process": f"{scene_name}根据镜头动作变化：人物、道具和宾客视线围绕“{_compact_shot_title(shot.title)}”重新组织。",
        },
        "camera": {
            "value": movement,
            "motion_process": _camera_motion_process(movement=movement, character_name=character_name, shot=shot),
        },
        "shot_size": {
            "value": camera_shot,
            "motion_process": f"以 {camera_shot} 组织画面重点，突出“{_compact_shot_title(shot.title)}”的动作和情绪。",
        },
        "shooting_method": {
            "value": "手绘电影故事板，红色身体运动箭头、蓝色摄像机运动箭头、绿色构图标记",
            "motion_process": action_process,
        },
        "lighting": {
            "value": lighting,
            "motion_process": "门口逆光勾勒人物轮廓，前景用冷白追光压住主体，背景宴会暖光降低饱和度。",
        },
    }
    prompt = _storyboard_prompt(
        one_sentence=one_sentence,
        six_elements=six_elements,
        character=character,
        scene=scene,
        shot=shot,
    )
    return StoryboardSpec(one_sentence_summary=one_sentence, six_elements=six_elements, prompt=prompt)


def build_hand_drawn_storyboard_page_spec(
    *,
    chapter_id: str,
    panels: list[StoryboardPanelSpec],
    reference_character: Character | None,
    reference_scene: Scene | None,
) -> StoryboardPageSpec:
    sorted_panels = sorted(panels, key=lambda panel: panel.shot_index)
    panel_count = len(sorted_panels)
    prompt = _storyboard_page_prompt(
        panels=sorted_panels,
        reference_character=reference_character,
        reference_scene=reference_scene,
    )
    return StoryboardPageSpec(chapter_id=chapter_id, panel_count=panel_count, panels=sorted_panels, prompt=prompt)


async def _load_chapter_shots(db: AsyncSession, *, project_id: str, chapter_id: str) -> list[Shot]:
    stmt = (
        select(Shot)
        .join(Chapter, Chapter.id == Shot.chapter_id)
        .where(Chapter.id == chapter_id, Chapter.project_id == project_id)
        .order_by(Shot.index.asc())
    )
    return list((await db.execute(stmt)).scalars().all())


async def _load_project_shot(db: AsyncSession, *, project_id: str, shot_id: str) -> Shot:
    stmt = (
        select(Shot)
        .join(Chapter, Chapter.id == Shot.chapter_id)
        .where(Shot.id == shot_id, Chapter.project_id == project_id)
        .limit(1)
    )
    shot = (await db.execute(stmt)).scalars().first()
    if shot is None:
        raise ValueError("Shot not found in project")
    return shot


async def _resolve_character(db: AsyncSession, *, shot_id: str, character_id: str | None) -> Character | None:
    if character_id:
        return await db.get(Character, character_id)
    stmt = (
        select(Character)
        .join(ShotCharacterLink, ShotCharacterLink.character_id == Character.id)
        .where(ShotCharacterLink.shot_id == shot_id)
        .order_by(ShotCharacterLink.index.asc())
        .limit(1)
    )
    return (await db.execute(stmt)).scalars().first()


async def _resolve_scene(db: AsyncSession, *, detail: ShotDetail | None, scene_id: str | None, shot_id: str | None = None) -> Scene | None:
    target_id = scene_id or (detail.scene_id if detail is not None else None)
    if not target_id and shot_id:
        target_id = (
            await db.execute(
                select(ProjectSceneLink.scene_id)
                .where(ProjectSceneLink.shot_id == shot_id)
                .order_by(ProjectSceneLink.id.asc())
                .limit(1)
            )
        ).scalar_one_or_none()
    if not target_id:
        return None
    return await db.get(Scene, target_id)


async def _first_project_character_with_image(db: AsyncSession, project_id: str) -> Character | None:
    stmt = (
        select(Character)
        .join(CharacterImage, CharacterImage.character_id == Character.id)
        .where(Character.project_id == project_id, CharacterImage.file_id.is_not(None))
        .order_by(CharacterImage.is_primary.desc(), CharacterImage.created_at.desc())
        .limit(1)
    )
    return (await db.execute(stmt)).scalars().first()


async def _first_chapter_scene_with_image(db: AsyncSession, shots: list[Shot]) -> Scene | None:
    shot_ids = [shot.id for shot in shots]
    if not shot_ids:
        return None
    stmt = (
        select(Scene)
        .join(ProjectSceneLink, ProjectSceneLink.scene_id == Scene.id)
        .join(SceneImage, SceneImage.scene_id == Scene.id)
        .where(ProjectSceneLink.shot_id.in_(shot_ids), SceneImage.file_id.is_not(None))
        .order_by(SceneImage.created_at.desc())
        .limit(1)
    )
    return (await db.execute(stmt)).scalars().first()


async def _reference_images(db: AsyncSession, *, character: Character | None, scene: Scene | None) -> list[dict[str, str]]:
    refs: list[dict[str, str]] = []
    if character is not None:
        ref = await resolve_front_image_ref(
            db,
            image_model=CharacterImage,
            parent_field_name="character_id",
            parent_id=character.id,
            preferred_quality_level=AssetQualityLevel.high,
        )
        if ref is not None:
            refs.append(ref)
    if scene is not None:
        ref = await resolve_front_image_ref(
            db,
            image_model=SceneImage,
            parent_field_name="scene_id",
            parent_id=scene.id,
            preferred_quality_level=AssetQualityLevel.high,
        )
        if ref is not None:
            refs.append(ref)
    return refs


def _storyboard_page_prompt(
    *,
    panels: list[StoryboardPanelSpec],
    reference_character: Character | None,
    reference_scene: Scene | None,
) -> str:
    character_bible = reference_character.bible_json if reference_character is not None else {}
    scene_text = reference_scene.description if reference_scene is not None else ""
    layout = _storyboard_grid_layout(len(panels))
    panel_lines = "\n".join(
        f"{panel.shot_index}. {panel.shot_title}｜图下可见一句话：{panel.one_sentence_summary}｜画面要点：{panel.six_elements['shooting_method']['motion_process']}"
        for panel in panels
    )
    return (
        f"生成一张电影导演用手绘故事板页，9:16 竖图，一页纸内清晰分成 {len(panels)} 个分镜格。"
        "脚本忠实度是最高优先级：严格忠实已给出的镜头内容，只做视觉化和构图表达；禁止自行扩展、改写、补写或添加镜头清单里没有的人物、事件、台词、道具、机构和反转；剧情要紧凑，不注水。"
        f"布局要求：使用专业电影分镜脚本排版，{layout}；每个格子边框清楚，必须严格按照 1→2→3→4→... 的时间顺序从上到下、从左到右排列，第1格是剧情开头，最后一格是结尾，中间按时间推进，不能跳序、倒序或打断叙事流。"
        "每个分镜格左上角必须标出清晰可见的格号数字 1、2、3、4...，像真实电影分镜脚本编号；编号只放在左上角，不遮挡主体。"
        "格内是该镜头手绘分镜，格子下方留白写一句中文短总结。"
        "每格内部必须有红色箭头表示身体/手部运动，蓝色箭头表示摄像机运动，绿色小标记表示构图重点。"
        "红/蓝/绿标记只能放在格内画面上；六要素结构化信息不要写进图里。"
        "允许每格左上角格号数字和格子下方一句中文总结，除此之外不要标题、对白、字幕、水印、长段说明或技术参数。"
        "整体风格：黑白铅笔手绘、灰阶阴影、纸面扫描质感、电影预演故事板，不追求脸部精细，重点是构图和运动。"
        f"逐格内容如下：\n{panel_lines}\n"
        f"角色一致性参考（只用于外形，不写字）：{character_bible}。"
        f"场景一致性参考（只用于空间，不写字）：{scene_text}。"
        "请保证每格下方的一句话短、可读、紧贴对应格子，所有格子构图互不混杂。"
    )


def _storyboard_grid_layout(panel_count: int) -> str:
    if panel_count <= 4:
        return f"2列×{max(1, (panel_count + 1) // 2)}行网格"
    if panel_count <= 8:
        return f"2列×{(panel_count + 1) // 2}行网格"
    return f"3列×{(panel_count + 2) // 3}行网格"


def _one_sentence_summary(*, scene_name: str, character_name: str, shot: Shot, action_process: str) -> str:
    title = _compact_shot_title(shot.title)
    first_action = action_process.split("；", 1)[0].strip("。； ")
    if first_action:
        return f"{scene_name}，{title}，{first_action}。"
    return f"{scene_name}，{character_name}完成{title}，情绪和动作清晰推进。"


def _storyboard_subject_name(*, shot: Shot, detail: ShotDetail | None, character: Character | None) -> str:
    """避免旧角色链接把原剧本没有的主体带进故事板六要素。"""

    source_text = " ".join(
        part
        for part in [
            shot.title,
            shot.script_excerpt,
            detail.description if detail is not None else "",
            "；".join(detail.action_beats or []) if detail is not None else "",
        ]
        if part
    )
    if character is not None and character.name and character.name in source_text:
        return character.name
    return _compact_shot_title(shot.title)


def _compact_shot_title(title: str) -> str:
    cleaned = str(title or "").strip()
    if "——" in cleaned:
        cleaned = cleaned.split("——", 1)[1].strip()
    return cleaned or "关键动作"


def _camera_motion_process(*, movement: str, character_name: str, shot: Shot) -> str:
    title = _compact_shot_title(shot.title)
    movement_map = {
        "STATIC": f"镜头保持稳定，让{title}的动作在画面内部完成。",
        "PAN": f"镜头横摇追随视线转移，揭示{title}的空间关系。",
        "DOLLY_IN": f"镜头缓慢推近{character_name}，把观众注意力压到{title}的关键表情或道具。",
        "HANDHELD": f"手持镜头制造现场混乱感，跟随{title}的冲突节奏晃动。",
        "TRACK": f"轨道跟拍人物移动，保留红毯纵深和{title}的入场方向。",
        "CRANE": f"摇臂升起或拉远，展示{title}后的空间孤立感。",
    }
    return movement_map.get(movement, f"镜头按 {movement} 运动，服务于{title}的叙事重点。")


def _storyboard_prompt(
    *,
    one_sentence: str,
    six_elements: dict[str, Any],
    character: Character | None,
    scene: Scene | None,
    shot: Shot,
) -> str:
    character_bible = character.bible_json if character is not None else {}
    scene_text = scene.description if scene is not None else ""
    return (
        "生成一张电影导演用手绘故事板图，9:16 竖图，黑白铅笔线稿加少量灰阶阴影，纸面扫描质感。"
        "脚本忠实度是最高优先级：严格忠实镜头标题和剧情摘录，只做视觉化和构图表达；禁止自行扩展、改写、补写或添加镜头里没有的人物、事件、台词、道具、机构和反转；剧情要紧凑，不注水。"
        "必须像专业故事板：画面中只有构图、人物、场景、动作箭头和构图标记，不要任何文字、标题、对白、字幕、编号或水印。"
        "参考抖音钢琴师故事板标注体系：红色箭头表示身体/手部运动，蓝色箭头表示摄像机运动，绿色小标记表示构图重点；标记只能是箭头和抽象符号，不能写字。"
        f"镜头内容：{shot.title}，{shot.script_excerpt}。"
        f"镜头标题：{shot.title}。剧情摘录：{shot.script_excerpt}。"
        f"可见总结仅供系统展示，不要画在图里：{one_sentence}。"
        f"主体六要素供构图参考但不要写成文字：{six_elements}。"
        f"角色一致性参考：{character_bible}。"
        f"场景一致性参考：{scene_text}。"
        "构图要求：低角度中远景到中景的入场动势，红毯纵深明显，人物位于三分线，背景宾客虚化成线稿群像。"
        "输出必须无画面文字，纯视觉故事板。"
    )


async def _upsert_storyboard_artifact(
    db: AsyncSession,
    *,
    project_id: str,
    shot_id: str,
    task_id: str,
    file_id: str | None,
    image_url: str | None,
    spec: StoryboardSpec,
) -> AgentArtifact:
    stmt = (
        select(AgentArtifact)
        .where(AgentArtifact.project_id == project_id, AgentArtifact.kind == AgentArtifactKind.storyboard)
        .order_by(AgentArtifact.version.desc())
        .limit(1)
    )
    existing = (await db.execute(stmt)).scalars().first()
    content_json = dict(existing.content_json or {}) if existing is not None else {}
    frames = list(content_json.get("frames") or [])
    frames = [frame for frame in frames if not (isinstance(frame, dict) and frame.get("shot_id") == shot_id)]
    frames.append(
        {
            "shot_id": shot_id,
            "style": "hand_drawn_storyboard",
            "aspect_ratio": "9:16",
            "visible_summary": spec.one_sentence_summary,
            "six_elements_for_video_model": spec.six_elements,
            "image_file_id": file_id,
            "image_url": image_url,
            "task_id": task_id,
        }
    )
    content_json["frames"] = frames
    content_json["schema_version"] = 1
    content_json["summary_layer"] = "visible_one_sentence_below_image"
    content_json["video_model_layer"] = "six_elements_for_video_model_only"
    if existing is not None:
        existing.content_json = content_json
        existing.content_text = spec.one_sentence_summary
        existing.status = AgentArtifactStatus.draft
        return existing
    artifact = AgentArtifact(
        id=f"artifact_{uuid4().hex[:16]}",
        project_id=project_id,
        kind=AgentArtifactKind.storyboard,
        version=1,
        status=AgentArtifactStatus.draft,
        content_text=spec.one_sentence_summary,
        content_json=content_json,
    )
    db.add(artifact)
    return artifact


async def _upsert_storyboard_page_artifact(
    db: AsyncSession,
    *,
    project_id: str,
    chapter_id: str,
    task_id: str,
    file_id: str | None,
    image_url: str | None,
    spec: StoryboardPageSpec,
) -> AgentArtifact:
    stmt = (
        select(AgentArtifact)
        .where(AgentArtifact.project_id == project_id, AgentArtifact.kind == AgentArtifactKind.storyboard)
        .order_by(AgentArtifact.version.desc())
        .limit(1)
    )
    existing = (await db.execute(stmt)).scalars().first()
    content_json = dict(existing.content_json or {}) if existing is not None else {}
    pages = list(content_json.get("pages") or [])
    pages = [page for page in pages if not (isinstance(page, dict) and page.get("chapter_id") == chapter_id)]
    panel_payloads = [_panel_payload(panel) for panel in spec.panels]
    pages.append(
        {
            "chapter_id": chapter_id,
            "style": "hand_drawn_storyboard_page",
            "aspect_ratio": "9:16",
            "panel_count": spec.panel_count,
            "layout": "2_columns_x_4_rows_when_8_panels",
            "visible_summary_layer": "one_sentence_below_each_panel",
            "video_model_layer": "six_elements_for_video_model_only",
            "image_file_id": file_id,
            "image_url": image_url,
            "task_id": task_id,
            "panels": panel_payloads,
        }
    )
    content_json["pages"] = pages
    content_json["schema_version"] = 2
    content_json["summary_layer"] = "visible_one_sentence_below_each_panel"
    content_json["video_model_layer"] = "six_elements_for_video_model_only"
    content_text = "\n".join(panel.one_sentence_summary for panel in spec.panels)
    if existing is not None:
        existing.content_json = content_json
        existing.content_text = content_text
        existing.status = AgentArtifactStatus.draft
        return existing
    artifact = AgentArtifact(
        id=f"artifact_{uuid4().hex[:16]}",
        project_id=project_id,
        kind=AgentArtifactKind.storyboard,
        version=1,
        status=AgentArtifactStatus.draft,
        content_text=content_text,
        content_json=content_json,
    )
    db.add(artifact)
    return artifact


def _enum_value(value: object) -> str:
    return str(value.value if hasattr(value, "value") else value)


def _panel_payload(panel: StoryboardPanelSpec) -> dict[str, Any]:
    return {
        "shot_id": panel.shot_id,
        "shot_index": panel.shot_index,
        "shot_title": panel.shot_title,
        "visible_summary": panel.one_sentence_summary,
        "six_elements_for_video_model": panel.six_elements,
    }
