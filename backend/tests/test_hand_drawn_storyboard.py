from __future__ import annotations

from app.models.studio import CameraAngle, CameraMovement, CameraShotType, Character, ProjectStyle, ProjectVisualStyle, Scene, Shot, ShotDetail, VFXType
from app.services.studio.agent.hand_drawn_storyboard import (
    StoryboardPanelSpec,
    build_hand_drawn_storyboard_page_spec,
    build_hand_drawn_storyboard_spec,
)


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

    assert spec.panel_count == 8
    assert "一页纸内清晰分成 8 个分镜格" in spec.prompt
    assert "2列×4行网格" in spec.prompt
    assert "格子下方留白写一句中文短总结" in spec.prompt
    assert "脚本忠实度是最高优先级" in spec.prompt
    assert "禁止自行扩展、改写、补写或添加" in spec.prompt
    assert "严格按照 1→2→3→4→..." in spec.prompt
    assert "第1格是剧情开头，最后一格是结尾" in spec.prompt
    assert "左上角必须标出清晰可见的格号数字 1、2、3、4" in spec.prompt
    assert "红色箭头" in spec.prompt
    assert "蓝色箭头" in spec.prompt
    assert "绿色小标记" in spec.prompt
    assert "六要素结构化信息不要写进图里" in spec.prompt
    assert "允许每格左上角格号数字和格子下方一句中文总结" in spec.prompt
    assert "第8格，一句话总结。" in spec.prompt


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

    assert [panel.shot_index for panel in spec.panels] == [1, 2]
    assert spec.prompt.index("1. 第一格") < spec.prompt.index("2. 第二格")
