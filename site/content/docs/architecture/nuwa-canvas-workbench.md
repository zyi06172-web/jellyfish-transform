---
title: "女娲画布工作台"
description: "当前女娲工作台的前端路由、画布节点、后端能力边界与持久化约定。"
---

# 女娲画布工作台

当前工作台以 `/projects/:projectId` 为唯一项目画布路由。前端删除 Jellyfish 时代的固定分栏、旧章节页、旧镜头页、旧视频编辑器、旧全局资产库和后台管理页，只保留女娲首页、项目画布列表、项目画布、项目级资产库与热度排行榜。

画布引擎使用 `@xyflow/react`。画布支持拖拽平移、滚轮缩放、框选、多选、节点拖动、节点复制、节点删除、连线、minimap、缩放控件、fit-view、画布右键新增节点与节点右键菜单。节点类型包括剧本、角色资产、场景资产、故事板、镜头分组、关键帧、分镜表和视频。

Agent 仍然是主路径。画布右侧常驻 `AgentChat`，继续调用 `GET /api/v1/studio/projects/{project_id}/workspace` 和 `POST /api/v1/studio/projects/{project_id}/agent/turns`。前端只编排 UI，不直接调用模型；DeepSeek、Seedream、Seedance 的模型路由和工作流仍由后端服务负责。

项目资产库保留女娲版 `ProjectAssetLibraryPage`，入口为 `/projects/:projectId/asset-library`。全局 `/asset-library` 只作为项目资产库入口页，不再展示 Jellyfish 旧的四 tab 资产管理界面。

画布状态保存到后端表 `project_canvas_states`，通过 `GET/PATCH /api/v1/studio/projects/{project_id}/canvas-state` 读写节点、连线和视口。前端在接口不可用时使用 localStorage 兜底，但正式路径应以 OpenAPI generated client 调用后端接口。

旧时间线视频编辑器已删除。视频节点、关键帧节点和分镜表节点负责提供本地下载入口：单个产物直接打开下载，多产物打包为 zip，供外部剪辑软件继续处理。

