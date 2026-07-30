---
title: "女娲画布工作台"
description: "当前女娲工作台的前端路由、画布节点、后端能力边界与持久化约定。"
---

# 女娲画布工作台

当前工作台以 `/projects/:projectId` 为项目画布路由。一部剧是一个 project，一集是一个 chapter；`/canvases` 是多集管理器，点击某一集后进入 `/projects/:projectId?chapterId=:chapterId`。旧 `ProjectWorkbench` 只保留路由桥，实际渲染第 6 批 `CanvasPage`。前端删除 Jellyfish 时代的固定分栏、旧章节页、旧镜头页、旧视频编辑器、旧全局资产库和后台管理页，只保留女娲首页、多集画布列表、项目画布、项目级资产库与热度排行榜。

画布引擎使用 `@xyflow/react`，第 6 批不换引擎。节点注册表位于 `front/src/components/nodes/index.ts`，注册十个独立节点键：`script`、`character`、`location`、`prop`、`storyboard`、`shot_group`、`keyframe`、`shotlist_text`、`shotlist_render`、`video`。每类节点有独立组件文件，共用外壳只放在 `NodeLayout` / `NodeToolbar` / `NodeStates`，不再使用旧的单组件分支渲染方案。

Agent 仍然是主路径。画布内右下角浮动 `AgentDock` 小面板，支持收起为轻量入口，不占用整条右侧栏。它继续调用 `GET /api/v1/studio/projects/{project_id}/workspace` 和 `POST /api/v1/studio/projects/{project_id}/agent/turns`。首页创建画布改走 `POST /api/v1/studio/projects/blank-canvas`，只创建空白 project 与 Agent session，不再用默认 from-prompt 文案触发首页分析。用户从画布内 AgentDock 粘贴剧本进入正式 Agent intake 阶段。

项目默认比例读取 `Project.default_video_ratio`，为空时使用 `16:9`；镜头级后续可用 `ShotDetail.override_video_ratio` 覆盖。前端节点预览不再使用竖屏 CSS 硬编码。

渲染和出视频前有两道前端成本闸门：开始关键帧渲染前、开始 Seedance 视频前必须弹出确认。确认前前端不调用图片或视频任务创建接口；确认后将确认意图提交给 Agent 工作流继续执行。

项目资产库保留女娲版 `ProjectAssetLibraryPage`，入口为 `/projects/:projectId/asset-library`。全局 `/asset-library` 只作为项目资产库入口页，不再展示 Jellyfish 旧的四 tab 资产管理界面。

画布状态主路径保存到后端表 `chapter_canvas_states`，通过 `GET/PATCH /api/v1/studio/chapters/{chapter_id}/canvas-state` 读写节点、连线和视口。`project_canvas_states` 仅保留给无 `chapterId` 的兼容入口使用。前端在接口不可用时使用 localStorage 兜底，但正式路径应以 OpenAPI generated client 调用后端接口。

旧时间线视频编辑器已删除。视频节点、关键帧节点和分镜表节点负责提供本地下载入口：单个产物直接打开下载，多产物打包为 zip，供外部剪辑软件继续处理。画布顶部提供三个素材操作：生成前 5 个内容格的 9:16 关键帧任务、源码排版导出 6 格分镜表 PNG、在用户确认后调用 Seedance 视频任务接口。

关键帧节点会按当前 `chapterId` 读取每个镜头的 `ShotDetail` 与 `ShotFrameImage` 记录，优先展示已落库的首帧/关键帧文件。视频节点优先读取 `Shot.generated_video_file_id`，再兜底读取 `GenerationTaskLink(resource_type=video, relation_type=video)` 的文件关联。分镜表 PNG 是前端源码排版生成：前 5 格左侧绘制真实关键帧，右侧读取真实结构化镜头字段；第 6 格保持空白。

火山 Seedance 2.0 视频提交会显式携带 `resolution: 720p`、`ratio`、`duration` 与参考帧 content。若火山返回 4xx，后端错误会保留供应商响应体，便于区分参数错误、内容安全拦截与账号额度问题。
