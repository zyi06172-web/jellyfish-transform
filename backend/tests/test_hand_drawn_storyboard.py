from __future__ import annotations

import importlib.util
import sys
import types
from enum import Enum
from pathlib import Path
from types import SimpleNamespace


class _FlexibleModel:
    """测试用轻量模型，避免导入真实 ORM 聚合与数据库运行时。"""

    def __init__(self, **kwargs: object) -> None:
        for key, value in kwargs.items():
            setattr(self, key, value)


class CameraShotType(str, Enum):
    ecu = "ECU"
    mcu = "MCU"
    ms = "MS"
    mls = "MLS"
    ls = "LS"


class CameraAngle(str, Enum):
    eye_level = "EYE_LEVEL"
    low_angle = "LOW_ANGLE"


class CameraMovement(str, Enum):
    static = "STATIC"
    pan = "PAN"
    track = "TRACK"


class VFXType(str, Enum):
    none = "NONE"


class ProjectStyle(str, Enum):
    real_people_city = "real_people_city"


class ProjectVisualStyle(str, Enum):
    live_action = "live_action"


class AssetQualityLevel(str, Enum):
    high = "high"


class AgentArtifactKind(str, Enum):
    storyboard = "storyboard"


class AgentArtifactStatus(str, Enum):
    draft = "draft"


Character = Scene = Shot = ShotDetail = _FlexibleModel


def _install_storyboard_test_stubs() -> None:
    """安装故事板单测所需 stub，确保 pytest 不触发真实 DB/存储 I/O。"""

    studio_module = types.ModuleType("app.models.studio")
    for name in [
        "AgentArtifact",
        "CharacterImage",
        "Chapter",
        "SceneImage",
        "ShotCharacterLink",
        "ProjectSceneLink",
    ]:
        setattr(studio_module, name, _FlexibleModel)
    for name, value in {
        "AgentArtifactKind": AgentArtifactKind,
        "AgentArtifactStatus": AgentArtifactStatus,
        "AssetQualityLevel": AssetQualityLevel,
        "Character": Character,
        "Scene": Scene,
        "Shot": Shot,
        "ShotDetail": ShotDetail,
    }.items():
        setattr(studio_module, name, value)

    task_module = types.ModuleType("app.models.task")
    task_module.GenerationTask = _FlexibleModel

    runner_module = types.ModuleType("app.services.studio.image_task_runner")

    async def _unused_async(*_: object, **__: object) -> None:
        return None

    runner_module.create_image_task_and_link = _unused_async
    runner_module.run_image_generation_task = _unused_async

    image_tasks_module = types.ModuleType("app.services.studio.image_tasks")
    image_tasks_module.resolve_front_image_ref = _unused_async

    files_module = types.ModuleType("app.utils.files")
    files_module.create_file_from_url_or_b64 = _unused_async

    for name, module in {
        "app.models": types.ModuleType("app.models"),
        "app.models.studio": studio_module,
        "app.models.task": task_module,
        "app.services": types.ModuleType("app.services"),
        "app.services.studio": types.ModuleType("app.services.studio"),
        "app.services.studio.image_task_runner": runner_module,
        "app.services.studio.image_tasks": image_tasks_module,
        "app.utils": types.ModuleType("app.utils"),
        "app.utils.files": files_module,
    }.items():
        module.__dict__.setdefault("__path__", [])
        sys.modules.setdefault(name, module)


def _load_storyboard_module() -> types.ModuleType:
    """按文件加载故事板模块，绕开重型 package __init__。"""

    _install_storyboard_test_stubs()
    module_path = Path(__file__).resolve().parents[1] / "app/services/studio/agent/hand_drawn_storyboard.py"
    spec = importlib.util.spec_from_file_location("hand_drawn_storyboard_under_test", module_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


_storyboard_module = _load_storyboard_module()
StoryboardPanelSpec = _storyboard_module.StoryboardPanelSpec
build_hand_drawn_storyboard_page_spec = _storyboard_module.build_hand_drawn_storyboard_page_spec
build_hand_drawn_storyboard_spec = _storyboard_module.build_hand_drawn_storyboard_spec


def test_hand_drawn_storyboard_keeps_visible_summary_separate_from_six_elements() -> None:
    shot = Shot(
        id="shot-leng-entry",
        chapter_id="chapter-1",
        index=1,
        title="冷司寒入场",
        thumbnail="",
        script_excerpt="宴会厅大门打开，冷司寒从逆光中走入。",
    )
    detail = ShotDetail(
        id=shot.id,
        camera_shot=CameraShotType.mls,
        angle=CameraAngle.low_angle,
        movement=CameraMovement.track,
        duration=6,
        mood_tags=[],
        atmosphere="门口逆光，宴会厅暖光压低，主体冷白追光",
        follow_atmosphere=True,
        has_bgm=False,
        vfx_type=VFXType.none,
        vfx_note="",
        description="冷司寒入场压住全场",
        action_beats=["大门打开", "冷司寒走入", "镜头跟拍推近"],
    )
    character = Character(
        id="char-leng",
        project_id="project-1",
        name="冷司寒",
        description="冷峻总裁",
        bible_json={"visual_anchors": {"eye_shape": "狭长凤眼"}, "wearable_accessories": [{"name": "银色胸针", "placement": "左胸"}]},
        style=ProjectStyle.real_people_city,
        visual_style=ProjectVisualStyle.live_action,
    )
    scene = Scene(
        id="scene-hall",
        name="酒店宴会厅",
        description="婚礼宴会厅，红毯纵深，宾客满座",
        style=ProjectStyle.real_people_city,
        visual_style=ProjectVisualStyle.live_action,
    )

    spec = build_hand_drawn_storyboard_spec(shot=shot, detail=detail, character=character, scene=scene)

    assert spec.one_sentence_summary == "酒店宴会厅，冷司寒入场，大门打开。"
    assert set(spec.six_elements) == {"subject", "scene", "camera", "shot_size", "shooting_method", "lighting"}
    assert spec.six_elements["subject"]["motion_process"]
    assert spec.six_elements["camera"]["motion_process"]
    assert "红色箭头" in spec.prompt
    assert "蓝色箭头" in spec.prompt
    assert "绿色小标记" in spec.prompt
    assert "不要任何文字" in spec.prompt
    assert "不要画在图里" in spec.prompt


def test_hand_drawn_storyboard_ignores_stale_character_link_not_in_shot_text() -> None:
    shot = Shot(
        id="shot-screen",
        chapter_id="chapter-1",
        index=4,
        title="大屏亮起——证据打断婚礼",
        thumbnail="",
        script_excerpt="宣誓前，大屏幕突然亮起，播放顾霆琛转移资产、林晚晚篡改病历的证据。",
    )
    detail = ShotDetail(
        id=shot.id,
        camera_shot=CameraShotType.ms,
        angle=CameraAngle.eye_level,
        movement=CameraMovement.pan,
        duration=5,
        mood_tags=[],
        atmosphere="宴会厅暖光转冷",
        follow_atmosphere=True,
        has_bgm=False,
        vfx_type=VFXType.none,
        vfx_note="",
        description="大屏证据突然打断婚礼。",
        action_beats=["宣誓前现场安静", "大屏幕突然亮起", "证据画面震住全场"],
    )
    stale_character = Character(
        id="char-emcee",
        project_id="project-1",
        name="司仪",
        description="旧链接残留",
        bible_json={},
        style=ProjectStyle.real_people_city,
        visual_style=ProjectVisualStyle.live_action,
    )
    scene = Scene(
        id="scene-hall",
        name="酒店宴会厅",
        description="婚礼宴会厅",
        style=ProjectStyle.real_people_city,
        visual_style=ProjectVisualStyle.live_action,
    )

    spec = build_hand_drawn_storyboard_spec(shot=shot, detail=detail, character=stale_character, scene=scene)

    assert spec.six_elements["subject"]["value"] == "证据打断婚礼"
    assert "司仪" not in spec.one_sentence_summary


def test_hand_drawn_storyboard_page_uses_one_seedream_call_for_all_panels() -> None:
    panels = [
        StoryboardPanelSpec(
            shot_id=f"shot-{i}",
            shot_index=i,
            shot_title=f"镜头{i}",
            one_sentence_summary=f"第{i}格，一句话总结。",
            six_elements={
                "subject": {"value": "沈知夏", "motion_process": "人物转身"},
                "scene": {"value": "酒店宴会厅", "motion_process": "宾客让开"},
                "camera": {"value": "TRACK", "motion_process": "镜头跟拍"},
                "shot_size": {"value": "MS", "motion_process": "中景推进"},
                "shooting_method": {"value": "红蓝绿标记", "motion_process": "红箭头标身体，蓝箭头标镜头，绿标记标构图"},
                "lighting": {"value": "冷白追光", "motion_process": "追光压住主体"},
            },
        )
        for i in range(1, 9)
    ]
    spec = build_hand_drawn_storyboard_page_spec(
        chapter_id="chapter-1",
        panels=panels,
        reference_character=None,
        reference_scene=None,
    )

    assert spec.panel_count == 6
    assert [panel.second for panel in spec.panels[:5]] == [1, 2, 3, 4, 5]
    assert spec.panels[5].is_blank is True
    assert spec.panels[5].six_elements == {}
    assert "16:9 横图" in spec.prompt
    assert "严格 2 行 × 3 列横向网格" in spec.prompt
    assert "第一行从左到右是 1、2、3，第二行从左到右是 4、5、6" in spec.prompt
    assert "禁止排成 2 列 × 3 行" in spec.prompt
    assert "第 1-5 格各代表 1 秒画面时间" in spec.prompt
    assert "第 6 格是空白结束格" in spec.prompt
    assert "第 6 格正下方不写说明" in spec.prompt
    assert "脚本忠实度是最高优先级" in spec.prompt
    assert "禁止自行扩展、改写、补写或添加" in spec.prompt
    assert "严格按时间顺序从左到右、从上到下排列" in spec.prompt
    assert "阿拉伯数字格号 1、2、3、4、5" in spec.prompt
    assert "红色箭头" in spec.prompt
    assert "蓝色箭头" in spec.prompt
    assert "绿色小标记" in spec.prompt
    assert "六要素结构化信息不要写进图里" in spec.prompt
    assert "第6格，一句话总结。" not in spec.prompt
    assert "第8格，一句话总结。" not in spec.prompt


def test_hand_drawn_storyboard_page_sorts_panels_by_time_index() -> None:
    panels = [
        StoryboardPanelSpec(
            shot_id="shot-2",
            shot_index=2,
            shot_title="第二格",
            one_sentence_summary="第二格总结。",
            six_elements={
                "subject": {"value": "主角", "motion_process": "动作二"},
                "scene": {"value": "场景", "motion_process": "场景二"},
                "camera": {"value": "STATIC", "motion_process": "镜头二"},
                "shot_size": {"value": "MS", "motion_process": "景别二"},
                "shooting_method": {"value": "标记", "motion_process": "动作二"},
                "lighting": {"value": "光线", "motion_process": "光线二"},
            },
        ),
        StoryboardPanelSpec(
            shot_id="shot-1",
            shot_index=1,
            shot_title="第一格",
            one_sentence_summary="第一格总结。",
            six_elements={
                "subject": {"value": "主角", "motion_process": "动作一"},
                "scene": {"value": "场景", "motion_process": "场景一"},
                "camera": {"value": "STATIC", "motion_process": "镜头一"},
                "shot_size": {"value": "MS", "motion_process": "景别一"},
                "shooting_method": {"value": "标记", "motion_process": "动作一"},
                "lighting": {"value": "光线", "motion_process": "光线一"},
            },
        ),
    ]
    spec = build_hand_drawn_storyboard_page_spec(
        chapter_id="chapter-1",
        panels=panels,
        reference_character=None,
        reference_scene=None,
    )

    assert [panel.shot_index for panel in spec.panels] == [1, 2, 3, 4, 5, 6]
    assert [panel.shot_title for panel in spec.panels[:5]] == ["第一格", "第二格", "第二格", "第二格", "第二格"]
    assert spec.panels[-1].is_blank is True
    assert spec.prompt.index("1. 第 1 秒：第一格") < spec.prompt.index("2. 第 2 秒：第二格")


def test_hand_drawn_storyboard_page_keeps_blank_panel_out_of_video_elements() -> None:
    panel = StoryboardPanelSpec(
        shot_id="shot-1",
        shot_index=1,
        shot_title="固定宽景",
        one_sentence_summary="雨中等待，动作轻微推进。",
        six_elements={
            "subject": {"value": "主角", "motion_process": "站在原地等待"},
            "scene": {"value": "巴士站", "motion_process": "雨线持续落下"},
            "camera": {"value": "STATIC", "motion_process": "固定镜头保持"},
            "shot_size": {"value": "LS", "motion_process": "宽景 hold"},
            "shooting_method": {"value": "标记", "motion_process": "红箭头标轻微动作，蓝箭头几乎不动，绿标记框住站牌"},
            "lighting": {"value": "阴雨自然光", "motion_process": "光线不变"},
        },
    )
    spec = build_hand_drawn_storyboard_page_spec(
        chapter_id="chapter-1",
        panels=[panel],
        reference_character=None,
        reference_scene=None,
    )

    assert [item.shot_title for item in spec.panels[:5]] == ["固定宽景"] * 5
    assert spec.panels[5].one_sentence_summary == ""
    assert spec.panels[5].six_elements == {}
    assert "同一持续状态可以跨格 hold" in spec.prompt
    assert "6. 空白格｜留空，不画内容、不加说明｜六要素为空" in spec.prompt


def test_hand_drawn_storyboard_page_derives_shot_groups_with_peak_guard() -> None:
    panels = []
    for index, title in enumerate(["宾客等待", "沈知夏低头", "冷司寒入场", "证据打断婚礼", "顾霆琛抢遥控器"], start=1):
        panels.append(
            StoryboardPanelSpec(
                shot_id=f"shot-{index}",
                shot_index=index,
                shot_title=title,
                one_sentence_summary=f"{title}，动作按时序推进。",
                six_elements={
                    "subject": {"value": "沈知夏", "motion_process": f"{title}的可见动作"},
                    "scene": {"value": "婚礼大堂", "motion_process": "红毯和舞台保持空间连续"},
                    "camera": {"value": "STATIC", "motion_process": "镜头稳定"},
                    "shot_size": {"value": "MS", "motion_process": "中景叙事"},
                    "shooting_method": {"value": "标记", "motion_process": f"{title}的身体运动和摄像机运动"},
                    "lighting": {"value": "冷白追光", "motion_process": "光线连续"},
                },
            )
        )

    spec = build_hand_drawn_storyboard_page_spec(
        chapter_id="chapter-1",
        panels=panels,
        reference_character=None,
        reference_scene=None,
    )

    assert 2 <= len(spec.shots) <= 3
    assert spec.panels[-1].shot_group is None
    assert {panel.shot_group for panel in spec.panels[:5]} == {1, 2, 3}
    peak_groups = [group for group in spec.shots if group.is_peak]
    assert len(peak_groups) == 1
    peak = peak_groups[0]
    assert peak.first_cell == peak.last_cell == 4
    assert peak.camera_shot in {"ECU", "CU"}
    assert peak.movement == "DOLLY_IN"
    assert "180°" in peak.screen_direction
    assert "构图锚点" in peak.composition_anchor
    assert "panel_to_shot" not in spec.prompt
    assert "峰值单独成镜" in spec.prompt
