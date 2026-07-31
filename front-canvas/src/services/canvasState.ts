import { OpenAPI } from './generated/core/OpenAPI'
import { request as __request } from './generated/core/request'
import type { CancelablePromise } from './generated/core/CancelablePromise'

/**
 * 画布状态持久化（GET/PATCH /api/v1/studio/projects/{project_id}/canvas-state）。
 *
 * 说明：这两个接口在后端源码里真实存在
 * （backend/app/api/v1/routes/studio/projects.py:304-370），字段与
 * ProjectCanvasStateRead / ProjectCanvasStateUpdate 完全一致。仓库里签入的
 * front/openapi.json 快照落后于后端源码、尚未包含它们，因此这里没有走
 * codegen，而是手写了一个字段对齐的轻量 client，复用与生成代码相同的
 * OpenAPI/request 基础设施。等后端跑起来后执行一次 `pnpm run openapi:update`
 * 重新生成，即可原样替换为生成版本，不影响调用方代码。
 */

export interface CanvasViewport {
  x: number
  y: number
  zoom: number
}

export interface CanvasStateRead {
  project_id: string
  nodes: Record<string, unknown>[]
  edges: Record<string, unknown>[]
  viewport: CanvasViewport
}

export interface CanvasStateUpdate {
  nodes: Record<string, unknown>[]
  edges: Record<string, unknown>[]
  viewport: CanvasViewport
}

interface ApiEnvelope<T> {
  data?: T
}

export const CanvasStateService = {
  get(projectId: string): CancelablePromise<ApiEnvelope<CanvasStateRead>> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/api/v1/studio/projects/{project_id}/canvas-state',
      path: { project_id: projectId },
    })
  },
  update(projectId: string, body: CanvasStateUpdate): CancelablePromise<ApiEnvelope<CanvasStateRead>> {
    return __request(OpenAPI, {
      method: 'PATCH',
      url: '/api/v1/studio/projects/{project_id}/canvas-state',
      path: { project_id: projectId },
      body,
      mediaType: 'application/json',
    })
  },
}
