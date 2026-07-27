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

STORYBOARD_PAGE_CONTENT_SECONDS = 5
STORYBOARD_PAGE_TOTAL_PANELS = 6
STORYBOARD_PAGE_TARGET_RATIO = "16:9"


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
    second: int | None = None
    is_blank: bool = False
    shot_group: int | None = None
    screen_direction_guidance: str = ""
    composition_anchor: str = ""
    emotion: str = ""


@dataclass(slots=True)
class StoryboardShotGroupSpec:
    """由 5 个时序故事板内容格派生出的视频镜头分组。"""

    shot_group: int
    first_cell: int
    last_cell: int
    duration_seconds: int
    camera_shot: str
    angle: str
    movement: str
    subject: str
    screen_direction: str
    composition_anchor: str
    action_beats: list[str]
    reference_mode: str
    motion_description: str
    is_peak: bool = False


@dataclass(slots=True)
class StoryboardPageSpec:
    """章节级多格故事板页。"""

    chapter_id: str
    panel_count: int
    panels: list[StoryboardPanelSpec]
    shots: list[StoryboardShotGroupSpec]
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
    """一次 Seedream 调用生成一页 5 秒档电影手绘故事板。

    章节可以包含任意数量镜头，但故事板 v2 固定输出 6 格：前 5 格按时间顺序
    表示第 1-5 秒画面，第 6 格为空白结束格。这样下游视频模型不会把结束
    留白误读成一个需要拍摄的镜头。
    """

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
        target_ratio=STORYBOARD_PAGE_TARGET_RATIO,
        resolution_profile="standard",
        purpose="video_reference",
        render_context={
            "agent_workflow": "phase_d_hand_drawn_storyboard_page",
            "project_id": project_id,
            "chapter_id": chapter_id,
            "panel_count": spec.panel_count,
            "duration_seconds": STORYBOARD_PAGE_CONTENT_SECONDS,
            "blank_panel_index": STORYBOARD_PAGE_TOTAL_PANELS,
            "six_elements_by_panel": [_panel_payload(panel) for panel in spec.panels],
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
    """构建 5 秒故事板页，并派生 2-3 个视频镜头分组。"""

    normalized_panels = _normalize_five_second_storyboard_panels(panels)
    shot_groups = _derive_storyboard_shot_groups(normalized_panels)
    panel_count = len(normalized_panels)
    prompt = _storyboard_page_prompt(
        panels=normalized_panels,
        shot_groups=shot_groups,
        reference_character=reference_character,
        reference_scene=reference_scene,
    )
    return StoryboardPageSpec(
        chapter_id=chapter_id,
        panel_count=panel_count,
        panels=normalized_panels,
        shots=shot_groups,
        prompt=prompt,
    )


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
    shot_groups: list[StoryboardShotGroupSpec],
    reference_character: Character | None,
    reference_scene: Scene | None,
) -> str:
    character_bible = reference_character.bible_json if reference_character is not None else {}
    scene_text = reference_scene.description if reference_scene is not None else ""
    panel_lines = "\n".join(_storyboard_panel_prompt_line(panel) for panel in panels)
    shot_group_lines = "\n".join(_storyboard_shot_group_prompt_line(group) for group in shot_groups)
    return (
        "专业电影分镜故事板，一整页，16:9 横图，铅笔手绘线稿风格，黑白，分镜格线干净利落。"
        f"版面固定为 {STORYBOARD_PAGE_TOTAL_PANELS} 格，严格 2 行 × 3 列横向网格，严格按时间顺序从左到右、从上到下排列；第一行从左到右是 1、2、3，第二行从左到右是 4、5、6；禁止排成 2 列 × 3 行，禁止把 3 和 4 的位置交换。"
        "脚本忠实度是最高优先级：严格忠实已给出的镜头内容，只做视觉化和构图表达；禁止自行扩展、改写、补写或添加镜头清单里没有的人物、事件、台词、道具、机构和反转；剧情要紧凑，不注水。"
        "第 1-5 格各代表 1 秒画面时间，必须有内容并按时序推进；同一持续状态可以跨格 hold，相邻格可近乎同构，只做细微推进，不硬凑新剧情。"
        "镜头分组只用于技术拍摄组织：时序不变，禁止一镜到底，默认 2-3 个镜头；钩子/反转/动作峰值必须单独成镜，用 ECU 或 CU 加 DOLLY_IN 推镜。"
        "第 6 格是空白结束格：留空，不画人物/场景/道具/箭头，不加说明，不渲染任何内容。"
        "每个非空分镜格左上角必须标出清晰可见的阿拉伯数字格号 1、2、3、4、5；第 6 格左上角只标数字 6。编号像真实电影分镜脚本编号，只放左上角，不遮挡主体。"
        "第 1-5 格的正下方各留一行简短中文说明；第 6 格正下方不写说明。"
        "每个非空格内部必须按镜头语言体现景别/角度/运镜；红色箭头表示人物/肢体运动，蓝色箭头表示摄像机运动，绿色小标记表示构图/取景。"
        "红/蓝/绿标记只能放在格内画面上；六要素结构化信息不要写进图里。"
        "除格号和第 1-5 格图下一行说明外，画面内不要任何其他文字、标题、对白、字幕、水印、长段说明或技术参数。"
        "整体参考真实电影分镜脚本与抖音手绘故事板：线条利落、构图专业、剧情紧凑。"
        f"逐格内容如下：\n{panel_lines}\n"
        f"镜头分组如下，只作为时序和镜头语言参考，不要画成文字：\n{shot_group_lines}\n"
        f"角色一致性参考（只用于外形，不写字）：{character_bible}。"
        f"场景一致性参考（只用于空间，不写字）：{scene_text}。"
        "角色与场景严格参照参考图，人物长相、服装、场景保持一致。请保证第 1-5 格下方的一句话短、可读、紧贴对应格子，所有格子构图互不混杂。"
    )


def _storyboard_panel_prompt_line(panel: StoryboardPanelSpec) -> str:
    """把单格结构化数据压成给图片模型读取的一行内容。"""

    if panel.is_blank:
        return f"{panel.shot_index}. 空白格｜留空，不画内容、不加说明｜六要素为空，不生成箭头或构图标记"
    shooting_method = panel.six_elements.get("shooting_method", {})
    camera = panel.six_elements.get("camera", {})
    shot_size = panel.six_elements.get("shot_size", {})
    return (
        f"{panel.shot_index}. 第 {panel.second} 秒：{panel.shot_title}"
        f"｜归属镜头：{panel.shot_group}"
        f"｜图下可见一句话：{panel.one_sentence_summary}"
        f"｜镜头语言：{shot_size.get('value', 'MS')} / {camera.get('value', 'STATIC')}"
        f"｜画面要点：{shooting_method.get('motion_process', '')}"
        f"｜朝向视线：{panel.screen_direction_guidance}"
        f"｜构图站位：{panel.composition_anchor}"
    )


def _storyboard_shot_group_prompt_line(group: StoryboardShotGroupSpec) -> str:
    """把技术镜头分组压缩为图片模型能遵守的时序提示。"""

    peak_text = "；峰值单独成镜" if group.is_peak else ""
    return (
        f"镜头 {group.shot_group}: 格 {group.first_cell}-{group.last_cell}，{group.duration_seconds} 秒，"
        f"{group.camera_shot}/{group.angle}/{group.movement}，主体 {group.subject}，"
        f"朝向 {group.screen_direction}，构图 {group.composition_anchor}，"
        f"运动 {group.motion_description}{peak_text}"
    )


def _normalize_five_second_storyboard_panels(panels: list[StoryboardPanelSpec]) -> list[StoryboardPanelSpec]:
    """将章节镜头标准化为 5 秒内容格 + 1 个空白结束格。

    输入镜头可以少于或多于 5 个。少于 5 个时沿用最后一个画面做 hold；
    多于 5 个时取前 5 个时序画面，保持“1 秒 1 格”的视频预演语义。
    """

    sorted_panels = sorted((panel for panel in panels if not panel.is_blank), key=lambda panel: panel.shot_index)
    if not sorted_panels:
        return [_blank_storyboard_panel()]
    content_panels: list[StoryboardPanelSpec] = []
    for offset in range(STORYBOARD_PAGE_CONTENT_SECONDS):
        source = sorted_panels[min(offset, len(sorted_panels) - 1)]
        content_panels.append(
            StoryboardPanelSpec(
                shot_id=source.shot_id,
                shot_index=offset + 1,
                shot_title=source.shot_title,
                one_sentence_summary=source.one_sentence_summary,
                six_elements=source.six_elements,
                second=offset + 1,
                is_blank=False,
                screen_direction_guidance=source.screen_direction_guidance,
                composition_anchor=source.composition_anchor,
                emotion=source.emotion,
            )
        )
    content_panels.append(_blank_storyboard_panel())
    return content_panels


def _blank_storyboard_panel() -> StoryboardPanelSpec:
    """创建第 6 格空白结束格；该格不向视频模型提供六要素。"""

    return StoryboardPanelSpec(
        shot_id="blank",
        shot_index=STORYBOARD_PAGE_TOTAL_PANELS,
        shot_title="空白格",
        one_sentence_summary="",
        six_elements={},
        second=None,
        is_blank=True,
        shot_group=None,
    )


def _derive_storyboard_shot_groups(panels: list[StoryboardPanelSpec]) -> list[StoryboardShotGroupSpec]:
    """按 5 个内容格派生 2-3 个视频镜头，并回填每格的镜头归属。

    这里不做剧情改写，只根据已存在的六要素、摘要和动作关键词做技术性归组。
    峰值格被强制拆成单独镜头，确保 Seedance 能拿到最紧景别和推进运动。
    """

    content_panels = [panel for panel in panels if not panel.is_blank][:STORYBOARD_PAGE_CONTENT_SECONDS]
    if not content_panels:
        return []

    peak_position = _find_peak_panel_position(content_panels)
    index_groups = _default_storyboard_group_indices(len(content_panels), peak_position)
    groups: list[StoryboardShotGroupSpec] = []
    for group_index, positions in enumerate(index_groups, start=1):
        grouped_panels = [content_panels[position] for position in positions]
        is_peak = peak_position in positions and len(positions) == 1
        group = _build_storyboard_shot_group(group_index=group_index, panels=grouped_panels, is_peak=is_peak)
        groups.append(group)
        for panel in grouped_panels:
            panel.shot_group = group_index
            panel.screen_direction_guidance = group.screen_direction
            panel.composition_anchor = group.composition_anchor
            panel.emotion = panel.emotion or _infer_panel_emotion(panel)
    return groups


def _default_storyboard_group_indices(content_count: int, peak_position: int) -> list[list[int]]:
    """生成默认 2-3 组的时序分组，避免一镜到底或切碎。"""

    if content_count <= 1:
        return [[0]]
    last_position = content_count - 1
    if peak_position <= 0:
        return [
            [0],
            [position for position in range(1, min(3, content_count))],
            [position for position in range(3, content_count)],
        ]
    if peak_position >= last_position:
        return [
            [position for position in range(0, max(1, last_position - 1))],
            [last_position - 1],
            [last_position],
        ]
    groups = [
        [position for position in range(0, peak_position)],
        [peak_position],
        [position for position in range(peak_position + 1, content_count)],
    ]
    return [group for group in groups if group]


def _find_peak_panel_position(panels: list[StoryboardPanelSpec]) -> int:
    """用动作/反转关键词和既有景别寻找钩子峰值格。"""

    best_index = 0
    best_score = -1
    for index, panel in enumerate(panels):
        text = " ".join(
            [
                panel.shot_title,
                panel.one_sentence_summary,
                _six_value(panel, "subject", "motion_process"),
                _six_value(panel, "shooting_method", "motion_process"),
            ]
        )
        score = index
        for keyword in ("证据", "打断", "抢", "反转", "揭露", "亮起", "峰值", "失控", "崩塌", "转身", "冲入"):
            if keyword in text:
                score += 10
        if _panel_camera_shot(panel) in {"ECU", "CU"}:
            score += 3
        if score > best_score:
            best_index = index
            best_score = score
    return best_index


def _build_storyboard_shot_group(
    *,
    group_index: int,
    panels: list[StoryboardPanelSpec],
    is_peak: bool,
) -> StoryboardShotGroupSpec:
    """把一组相邻内容格压成镜头级拍摄参数。"""

    first_panel = panels[0]
    last_panel = panels[-1]
    camera_shot = _panel_camera_shot(first_panel)
    movement = _panel_movement(first_panel)
    if is_peak:
        camera_shot = camera_shot if camera_shot in {"ECU", "CU"} else "CU"
        movement = "DOLLY_IN"
    screen_direction = _screen_direction_for_group(panels)
    composition_anchor = _composition_anchor_for_group(panels)
    action_beats = _action_beats_for_group(panels)
    return StoryboardShotGroupSpec(
        shot_group=group_index,
        first_cell=first_panel.shot_index,
        last_cell=last_panel.shot_index,
        duration_seconds=max(1, len(panels)),
        camera_shot=camera_shot,
        angle=_panel_angle(first_panel),
        movement=movement,
        subject=_panel_subject(first_panel),
        screen_direction=screen_direction,
        composition_anchor=composition_anchor,
        action_beats=action_beats,
        reference_mode=_reference_mode_for_group(panels=panels, is_peak=is_peak),
        motion_description=_motion_description_for_group(first_panel=first_panel, last_panel=last_panel),
        is_peak=is_peak,
    )


def _reference_mode_for_group(*, panels: list[StoryboardPanelSpec], is_peak: bool) -> str:
    if len(panels) <= 1:
        return "first"
    return "first_last_key" if is_peak else "first_last"


def _motion_description_for_group(*, first_panel: StoryboardPanelSpec, last_panel: StoryboardPanelSpec) -> str:
    start = _six_value(first_panel, "subject", "motion_process") or first_panel.one_sentence_summary
    end = _six_value(last_panel, "subject", "motion_process") or last_panel.one_sentence_summary
    if first_panel is last_panel or start == end:
        return f"持续保持：{start}"
    return f"从“{start}”自然推进到“{end}”"


def _action_beats_for_group(panels: list[StoryboardPanelSpec]) -> list[str]:
    beats: list[str] = []
    for panel in panels:
        motion = _six_value(panel, "subject", "motion_process") or panel.one_sentence_summary
        if motion and motion not in beats:
            beats.append(motion)
    return beats[:4]


def _screen_direction_for_group(panels: list[StoryboardPanelSpec]) -> str:
    subject = _panel_subject(panels[0])
    scene = _six_value(panels[0], "scene", "value") or "当前场景"
    return f"以{scene}的主空间轴线为 180° 轴线，{subject}的朝向、视线和左右关系在镜头内保持一致，跨镜头不无故越轴。"


def _composition_anchor_for_group(panels: list[StoryboardPanelSpec]) -> str:
    subject = _panel_subject(panels[0])
    scene = _six_value(panels[0], "scene", "value") or "当前场景"
    return f"以{scene}的红毯/入口/舞台纵深和{subject}站位为构图锚点，保持主体、背景和动作方向关系可读。"


def _infer_panel_emotion(panel: StoryboardPanelSpec) -> str:
    text = f"{panel.shot_title} {panel.one_sentence_summary} {_six_value(panel, 'subject', 'motion_process')}"
    if any(keyword in text for keyword in ("证据", "打断", "反转", "抢", "失控")):
        return "冲突峰值"
    if any(keyword in text for keyword in ("入场", "转身", "看向")):
        return "紧张推进"
    return "克制紧绷"


def _panel_subject(panel: StoryboardPanelSpec) -> str:
    return _six_value(panel, "subject", "value") or _compact_shot_title(panel.shot_title)


def _panel_camera_shot(panel: StoryboardPanelSpec) -> str:
    return _six_value(panel, "shot_size", "value") or "MS"


def _panel_movement(panel: StoryboardPanelSpec) -> str:
    return _six_value(panel, "camera", "value") or "STATIC"


def _panel_angle(panel: StoryboardPanelSpec) -> str:
    return _six_value(panel, "camera", "angle") or "EYE_LEVEL"


def _six_value(panel: StoryboardPanelSpec, category: str, key: str) -> str:
    value = panel.six_elements.get(category, {})
    if not isinstance(value, dict):
        return ""
    return str(value.get(key) or "").strip()


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
            "aspect_ratio": STORYBOARD_PAGE_TARGET_RATIO,
            "panel_count": spec.panel_count,
            "layout": "2_rows_x_3_columns",
            "duration_seconds": STORYBOARD_PAGE_CONTENT_SECONDS,
            "blank_panel_index": STORYBOARD_PAGE_TOTAL_PANELS,
            "visible_summary_layer": "one_sentence_below_each_panel",
            "video_model_layer": "six_elements_for_video_model_only",
            "image_file_id": file_id,
            "image_url": image_url,
            "task_id": task_id,
            "panels": panel_payloads,
            "shots": [_shot_group_payload(group) for group in spec.shots],
            "panel_to_shot": {
                str(panel.shot_index): panel.shot_group
                for panel in spec.panels
                if not panel.is_blank and panel.shot_group is not None
            },
        }
    )
    content_json["pages"] = pages
    content_json["schema_version"] = 4
    content_json["summary_layer"] = "visible_one_sentence_below_content_panels_only"
    content_json["video_model_layer"] = "six_elements_for_video_model_only"
    content_text = "\n".join(panel.one_sentence_summary for panel in spec.panels if panel.one_sentence_summary)
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
        "second": panel.second,
        "is_blank": panel.is_blank,
        "visible_summary": panel.one_sentence_summary,
        "six_elements_for_video_model": panel.six_elements,
        "shot_group": panel.shot_group,
        "screen_direction_guidance": panel.screen_direction_guidance,
        "composition_anchor": panel.composition_anchor,
        "emotion": panel.emotion,
    }


def _shot_group_payload(group: StoryboardShotGroupSpec) -> dict[str, Any]:
    """把镜头分组写成 artifact 中稳定可读的结构化数据。"""

    return {
        "shot_group": group.shot_group,
        "first_cell": group.first_cell,
        "last_cell": group.last_cell,
        "duration_seconds": group.duration_seconds,
        "camera_shot": group.camera_shot,
        "angle": group.angle,
        "movement": group.movement,
        "subject": group.subject,
        "screen_direction": group.screen_direction,
        "composition_anchor": group.composition_anchor,
        "action_beats": group.action_beats,
        "reference_mode": group.reference_mode,
        "motion_description": group.motion_description,
        "is_peak": group.is_peak,
    }
