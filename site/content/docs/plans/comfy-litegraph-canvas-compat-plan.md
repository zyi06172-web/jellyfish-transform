---
title: "Comfy LiteGraph 画布兼容计划"
description: "记录女娲工作台兼容 ComfyUI_frontend / LiteGraph 画布能力的阶段计划与许可证边界。"
---

# Comfy LiteGraph 画布兼容计划

## 背景

ComfyUI_frontend 当前画布能力基于 Comfy 维护的 LiteGraph fork。该仓库使用 GPL-3.0 许可证，不能在不保留许可证、来源与再分发约束的前提下无痕拷入女娲工作台。内部原型也应保留来源和 license 文件，避免将 GPL 代码直接混入自有业务模块。

## 当前阶段

女娲工作台仍以 `@xyflow/react` 作为正式画布引擎。Agent 工作流已经从右侧整栏调整为画布内右下角浮动小面板，保持原有 `workspace` 与 `agent/turns` 后端接口不变。

## 阶段计划

1. 建立隔离实验目录
   - 在明确许可证策略后，将 ComfyUI_frontend / LiteGraph 代码以 vendor、submodule 或独立 package 形式接入。
   - 保留 upstream license、notice、commit 来源和本地修改说明。
   - 不把 GPL 文件内容直接复制进现有业务组件。

2. 搭建 Nuwa Workflow 适配层
   - 定义女娲节点到 LiteGraph node 的映射。
   - 保持后端 `chapter_canvas_states` 读写契约稳定。
   - 区分前端完整 workflow 与后端 Agent / 生成任务执行 payload。

3. 逐步替换画布交互
   - 先验证拖拽、缩放、连线、节点右键菜单、保存与恢复。
   - 再接入故事板、镜头分组、关键帧、分镜表、视频节点。
   - Agent 浮动小面板继续作为画布内 UI，不回退到右侧整栏。

4. 验证与文档沉淀
   - 前端变更至少通过 `pnpm exec tsc --noEmit`。
   - 若状态模型或接口发生变化，同步 OpenAPI generated client。
   - 兼容层稳定落地后，将真实架构沉淀到 `architecture` 文档。

## 风险

- GPL-3.0 代码的分发义务需要提前确认，不能仅以“不商用、不上线”作为规避理由。
- ComfyUI_frontend 当前是 Vue 技术栈，女娲工作台是 React/Vite，直接整套嵌入会带来运行时、构建、样式和状态桥接成本。
- Comfy workflow 的执行 payload 与女娲 Agent 任务系统不同，需要适配层而不是直接复用后端执行协议。
