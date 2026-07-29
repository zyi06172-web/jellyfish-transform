"""Project/Chapter 的请求响应模型。"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models.studio import ChapterStatus, ProjectStyle, ProjectVisualStyle


PROJECT_STYLE_EXAMPLES = [x.value for x in ProjectStyle]


class ProjectBase(BaseModel):
    name: str = Field(..., description="项目名称")
    description: str = Field("", description="项目简介")
    style: ProjectStyle = Field(..., description="题材/风格", examples=PROJECT_STYLE_EXAMPLES)
    visual_style: ProjectVisualStyle = Field(ProjectVisualStyle.live_action, description="画面表现形式")
    seed: int = Field(0, description="随机种子")
    unify_style: bool = Field(True, description="是否统一风格")
    progress: int = Field(0, description="进度百分比（0-100）")
    default_video_ratio: str | None = Field(None, description="项目级默认视频比例；分镜未覆盖时生效")
    stats: dict[str, Any] = Field(default_factory=dict, description="聚合统计（JSON）")


class ProjectCreate(ProjectBase):
    id: str = Field(..., description="项目 ID")


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    style: ProjectStyle | None = Field(None, description="题材/风格", examples=PROJECT_STYLE_EXAMPLES)
    visual_style: ProjectVisualStyle | None = None
    seed: int | None = None
    unify_style: bool | None = None
    progress: int | None = None
    default_video_ratio: str | None = None
    stats: dict[str, Any] | None = None


class ProjectRead(ProjectBase):
    model_config = ConfigDict(from_attributes=True)

    id: str


class ProjectFromPromptRequest(BaseModel):
    prompt: str = Field(..., min_length=1, description="首页输入的剧情大纲或视频需求")
    skill_key: str = Field(..., description="首页选择的 Skill key")
    idempotency_key: str = Field(..., min_length=8, max_length=128, description="客户端幂等键")


class ProjectFromPromptRead(BaseModel):
    id: str = Field(..., description="项目 ID")
    project_id: str = Field(..., description="项目 ID")
    session_id: str = Field(..., description="Agent session ID")
    status: str = Field(..., description="分析动作状态")


class ChapterBase(BaseModel):
    project_id: str = Field(..., description="所属项目 ID")
    index: int = Field(..., description="章节序号（项目内唯一）")
    title: str = Field(..., description="章节标题")
    summary: str = Field("", description="章节摘要")
    raw_text: str = Field("", description="章节原文")
    condensed_text: str = Field("", description="精简原文")
    storyboard_count: int = Field(0, description="分镜数量")
    status: ChapterStatus = Field(ChapterStatus.draft, description="章节状态")


class ChapterCreate(ChapterBase):
    id: str = Field(..., description="章节 ID")


class ChapterUpdate(BaseModel):
    project_id: str | None = None
    index: int | None = None
    title: str | None = None
    summary: str | None = None
    raw_text: str | None = None
    condensed_text: str | None = None
    storyboard_count: int | None = None
    status: ChapterStatus | None = None


class ChapterRead(ChapterBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    shot_count: int = Field(0, description="分镜数（shots 条数聚合）")


class StyleOption(BaseModel):
    """通用下拉选项。"""

    value: str = Field(..., description="选项值")
    label: str = Field(..., description="选项展示文案")


class ProjectStyleOptionsRead(BaseModel):
    """项目风格候选项。"""

    visual_styles: list[StyleOption] = Field(default_factory=list, description="视觉风格可选项")
    styles_by_visual_style: dict[str, list[StyleOption]] = Field(
        default_factory=dict,
        description="按视觉风格分组的视频风格选项",
    )
    default_style_by_visual_style: dict[str, str] = Field(
        default_factory=dict,
        description="各视觉风格默认视频风格",
    )


class AssetLibraryReferenceImageRead(BaseModel):
    """资产库参考图。"""

    image_id: int = Field(..., description="资产图片行 ID")
    file_id: str = Field(..., description="文件 ID")
    url: str = Field(..., description="下载 URL")
    view_angle: str = Field(..., description="视角")
    quality_level: str = Field(..., description="质量等级")
    is_primary: bool = Field(False, description="是否主图")


class AssetLibraryRelationRead(BaseModel):
    """资产库卡片关系边。"""

    relation_type: str = Field(..., description="关系类型")
    target_type: str = Field(..., description="目标资产类型")
    target_id: str = Field(..., description="目标资产 ID")
    label: str = Field("", description="关系展示标签")


class AssetLibraryItemRead(BaseModel):
    """资产库单个资产。"""

    id: str = Field(..., description="资产 ID")
    type: str = Field(..., description="资产类型：character/scene/prop")
    name: str = Field(..., description="资产名称")
    description: str = Field("", description="资产描述")
    bible: dict[str, Any] = Field(default_factory=dict, description="角色圣经；非角色可为空")
    reference_images: list[AssetLibraryReferenceImageRead] = Field(default_factory=list, description="参考图列表")
    relations: list[AssetLibraryRelationRead] = Field(default_factory=list, description="卡片关系")


class ProjectAssetLibraryRead(BaseModel):
    """项目资产库读视图。"""

    project_id: str = Field(..., description="项目 ID")
    characters: list[AssetLibraryItemRead] = Field(default_factory=list, description="角色资产")
    scenes: list[AssetLibraryItemRead] = Field(default_factory=list, description="场景资产")
    props: list[AssetLibraryItemRead] = Field(default_factory=list, description="道具资产")


class ProjectCanvasViewport(BaseModel):
    """React Flow 画布视口。"""

    x: float = Field(0, description="视口 X 偏移")
    y: float = Field(0, description="视口 Y 偏移")
    zoom: float = Field(1, ge=0.1, le=2.5, description="缩放比例")


class ProjectCanvasStateRead(BaseModel):
    """项目画布持久化状态。"""

    project_id: str = Field(..., description="项目 ID")
    nodes: list[dict[str, Any]] = Field(default_factory=list, description="React Flow 节点")
    edges: list[dict[str, Any]] = Field(default_factory=list, description="React Flow 连线")
    viewport: ProjectCanvasViewport = Field(default_factory=ProjectCanvasViewport, description="画布视口")


class ProjectCanvasStateUpdate(BaseModel):
    """项目画布状态更新载荷。"""

    nodes: list[dict[str, Any]] = Field(default_factory=list, description="React Flow 节点")
    edges: list[dict[str, Any]] = Field(default_factory=list, description="React Flow 连线")
    viewport: ProjectCanvasViewport = Field(default_factory=ProjectCanvasViewport, description="画布视口")
