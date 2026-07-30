from __future__ import annotations

from enum import Enum


class ProjectStyle(str, Enum):
    """项目题材/风格维度（不用于区分真人/动漫）。"""

    # 真人：都市、科幻、古装；动漫：科幻、古装、3D、国漫、水墨画
    real_people_city = "真人都市"
    real_people_scifi = "真人科幻"
    real_people_ancient = "真人古装"
    anime_scifi = "动漫科幻"
    anime_3d = "动漫3D"
    guoman = "国漫"
    ink_wash = "水墨画"


class ProjectVisualStyle(str, Enum):
    """画面表现形式维度：用于区分现实/动漫等。"""

    live_action = "现实"
    anime = "动漫"


class ChapterStatus(str, Enum):
    """章节生产状态。"""

    draft = "draft"
    shooting = "shooting"
    done = "done"


class ShotStatus(str, Enum):
    """镜头生成状态（更多是“生产流程”而非剧情状态）。"""

    pending = "pending"
    generating = "generating"
    ready = "ready"


class ShotCandidateType(str, Enum):
    """镜头提取候选类型。"""

    character = "character"
    scene = "scene"
    prop = "prop"
    costume = "costume"


class ShotCandidateStatus(str, Enum):
    """镜头提取候选确认状态。"""

    pending = "pending"
    linked = "linked"
    ignored = "ignored"


class ShotDialogueCandidateStatus(str, Enum):
    """镜头对白提取候选确认状态。"""

    pending = "pending"
    accepted = "accepted"
    ignored = "ignored"


class CameraShotType(str, Enum):
    """景别（与 `app.schemas.skills.common.ShotType` 对齐，存英文 code）。"""

    ecu = "ECU"  # 大特写
    cu = "CU"  # 特写
    mcu = "MCU"  # 中近景
    ms = "MS"  # 中景
    mls = "MLS"  # 中远景
    ls = "LS"  # 远景
    els = "ELS"  # 大远景


class CameraAngle(str, Enum):
    """机位角度（与 `app.schemas.skills.common.CameraAngle` 对齐，存英文 code）。"""

    eye_level = "EYE_LEVEL"  # 平视
    high_angle = "HIGH_ANGLE"  # 高角度
    low_angle = "LOW_ANGLE"  # 低角度
    bird_eye = "BIRD_EYE"  # 鸟瞰
    dutch = "DUTCH"  # 荷兰式
    over_shoulder = "OVER_SHOULDER"  # 过肩


class CameraMovement(str, Enum):
    """运镜方式（与 `app.schemas.skills.common.CameraMovement` 对齐，存英文 code）。"""

    static = "STATIC"  # 静止
    pan = "PAN"  # 平移
    tilt = "TILT"  # 倾斜
    dolly_in = "DOLLY_IN"  # 拉近
    dolly_out = "DOLLY_OUT"  # 拉远
    track = "TRACK"  # 轨道
    crane = "CRANE"  # 摇臂
    handheld = "HANDHELD"  # 手持
    steadicam = "STEADICAM"  # 稳定器
    zoom_in = "ZOOM_IN"
    zoom_out = "ZOOM_OUT"  # 拉近


class AssetQualityLevel(str, Enum):
    """资产精度等级（由低到高逐步补齐更多角度/细节图）。"""

    low = "LOW"
    medium = "MEDIUM"
    high = "HIGH"
    ultra = "ULTRA"


class AssetViewAngle(str, Enum):
    """资产图片角度（用于多视图描述同一资产）。"""

    front = "FRONT"
    left = "LEFT"
    right = "RIGHT"
    back = "BACK"
    three_quarter = "THREE_QUARTER"
    top = "TOP"
    detail = "DETAIL"


class ShotFrameType(str, Enum):
    """镜头分镜帧类型：首帧/尾帧/关键帧。"""

    first = "first"
    last = "last"
    key = "key"


class FileType(str, Enum):
    """文件类型（用于素材库与时间线引用）。"""

    image = "image"
    video = "video"


class FileUsageKind(str, Enum):
    """文件在项目业务链上的用途（file_usages.usage_kind）。"""

    shot_frame = "shot_frame"
    generated_video = "generated_video"
    character_image = "character_image"
    asset_image = "asset_image"
    task_link = "task_link"
    upload = "upload"
    api = "api"


class TimelineClipType(str, Enum):
    """时间线片段类型（视频/音频）。"""

    video = "video"
    audio = "audio"


class DialogueLineMode(str, Enum):
    """对白模式（与 `app.schemas.skills.common.DialogueLineMode` 对齐，存英文 code）。"""

    dialogue = "DIALOGUE"  # 对白
    voice_over = "VOICE_OVER"  # 旁白
    off_screen = "OFF_SCREEN"  # 画外音
    phone = "PHONE"  # 电话声


class VFXType(str, Enum):
    """视效类型（与 `app.schemas.skills.common.VFXType` 对齐，存英文 code）。"""

    none = "NONE"  # 无
    particles = "PARTICLES"  # 粒子
    volumetric_fog = "VOLUMETRIC_FOG"  # 体积雾
    cg_double = "CG_DOUBLE"  # 数字替身
    digital_environment = "DIGITAL_ENVIRONMENT"  # 数字场景
    matte_painting = "MATTE_PAINTING"  # 绘景
    fire_smoke = "FIRE_SMOKE"  # 烟火
    water_sim = "WATER_SIM"  # 水效
    destruction = "DESTRUCTION"  # 破碎/解算
    energy_magic = "ENERGY_MAGIC"  # 能量/魔法
    compositing_cleanup = "COMPOSITING_CLEANUP"  # 合成/修脏
    slow_motion_time = "SLOW_MOTION_TIME"  # 升格/慢动作
    other = "OTHER"  # 其他


class PromptCategory(str, Enum):
    """提示词模板类别。"""

    frame_head_image = "frame_head_image"
    frame_tail_image = "frame_tail_image"
    frame_key_image = "frame_key_image"
    frame_head_prompt = "frame_head_prompt"
    frame_tail_prompt = "frame_tail_prompt"
    frame_key_prompt = "frame_key_prompt"
    video_prompt = "video_prompt"
    storyboard_prompt = "storyboard_prompt"
    bgm = "bgm"
    sfx = "sfx"
    character_image_front = "character_image_front"
    character_image_other = "character_image_other"
    actor_image_front = "actor_image_front"
    actor_image_other = "actor_image_other"
    prop_image_front = "prop_image_front"
    prop_image_other = "prop_image_other"
    scene_image_front = "scene_image_front"
    scene_image_other = "scene_image_other"
    costume_image_front = "costume_image_front"
    costume_image_other = "costume_image_other"
    combined = "combined"


class AgentSessionStage(str, Enum):
    """Flova Agent 工作台阶段，按完整 Skill 预留到最终合成。"""

    intake = "intake"
    spec_review = "spec_review"
    storyboard = "storyboard"
    extract = "extract"
    auto_confirm = "auto_confirm"
    elements_gen = "elements_gen"
    elements_review = "elements_review"
    shotlist_text = "shotlist_text"
    keyframe = "keyframe"
    shotlist_render = "shotlist_render"
    voice_anchor = "voice_anchor"
    shot_video = "shot_video"
    audio_layer = "audio_layer"
    assemble_export = "assemble_export"
    completed = "completed"


class AgentSessionStatus(str, Enum):
    """Agent 会话运行状态。"""

    active = "active"
    waiting_user = "waiting_user"
    running = "running"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class AgentMessageRole(str, Enum):
    """Agent 对话消息角色。"""

    user = "user"
    assistant = "assistant"
    system = "system"


class AgentMessageKind(str, Enum):
    """Agent 对话消息展示类型。"""

    text = "text"
    question_card = "question_card"
    task_update = "task_update"
    error = "error"


class AgentCheckpointStatus(str, Enum):
    """Agent 确认点状态。"""

    pending = "pending"
    confirmed = "confirmed"
    rejected = "rejected"
    superseded = "superseded"


class AgentArtifactKind(str, Enum):
    """Agent 产物类型，第一批只落库到 Step 4 所需产物。"""

    story_summary = "story_summary"
    final_video_spec = "final_video_spec"
    storyboard = "storyboard"
    shotlist_text = "shotlist_text"
    keyframe = "keyframe"
    shotlist_render = "shotlist_render"
    video = "video"


class AgentArtifactStatus(str, Enum):
    """Agent 产物版本状态。"""

    draft = "draft"
    confirmed = "confirmed"
    superseded = "superseded"


class AgentActionType(str, Enum):
    """Agent 动作类型，按 Flova 完整流程预留，执行能力分批接入。"""

    analyze = "analyze"
    divide_shots = "divide_shots"
    design_storyboard = "design_storyboard"
    extract_assets = "extract_assets"
    auto_confirm = "auto_confirm"
    generate_element_image = "generate_element_image"
    synthesize_prompt = "synthesize_prompt"
    generate_voice_anchor = "generate_voice_anchor"
    generate_shot_video = "generate_shot_video"
    generate_audio_layer = "generate_audio_layer"
    assemble_export = "assemble_export"
    regenerate_target = "regenerate_target"


class AgentActionStatus(str, Enum):
    """Agent 动作执行状态。"""

    pending = "pending"
    running = "running"
    succeeded = "succeeded"
    failed = "failed"
    cancelled = "cancelled"
