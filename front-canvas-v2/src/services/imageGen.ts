import { StudioEntitiesService } from './generated'
import { OpenAPI } from './generated/core/OpenAPI'
import { request as __request } from './generated/core/request'
import { buildFileDownloadUrl } from './fileUrl'
import { fetchImageUrlFromTaskResult, pollTask } from './generationRuntime'

/**
 * 通用"文本 → 图片"真实生成（走火山 Seedream，复用现有图像链路）。
 *
 * 后端没有"不挂靠实体的自由生图"接口，所有生图都挂在具体资产下。这里用后端的
 * 「道具(prop)」资产做**一次性载体**：建一个 view_count=1 的临时 prop → 拿到它自动
 * 预置的那个图片槽位 → 提交 image-task（真实 Seedream）→ 轮询 → 回填 file_id。
 * 这样短剧之外的通用图片节点、电商各步生图节点都能真正出图，而不是占位。
 *
 * 依赖 project_id：prop 必须挂到某个项目下，所以自由生图也需要当前画布对应的项目。
 */

interface PropImageRow {
  id: number
  view_angle: string
  file_id?: string | null
}

interface ApiEnvelope<T> {
  data?: T
}

function createAssetImageTask(propId: string, imageId: number, prompt: string, refFileIds: string[]) {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/image-tasks/assets/{asset_type}/{asset_id}/image-tasks',
    path: { asset_type: 'prop', asset_id: propId },
    body: { image_id: imageId, prompt, images: refFileIds },
    mediaType: 'application/json',
  }) as unknown as Promise<ApiEnvelope<{ task_id: string }>>
}

export async function generateImageFromPrompt(params: {
  projectId: string
  prompt: string
  name?: string
  refFileIds?: string[]
}): Promise<{ fileId?: string; url?: string; error?: string }> {
  const { projectId, prompt } = params
  if (!prompt.trim()) return { error: '请先填写提示词' }
  try {
    const propId = crypto.randomUUID()
    await StudioEntitiesService.createEntityApiV1StudioEntitiesEntityTypePost({
      entityType: 'prop',
      requestBody: {
        id: propId,
        name: params.name || `画布生图_${propId.slice(0, 6)}`,
        description: prompt.slice(0, 120),
        tags: ['canvas_image'],
        view_count: 1,
        style: '真人都市',
        visual_style: '现实',
        project_id: projectId,
      },
    })
    const listed = await StudioEntitiesService.listEntityImagesApiV1StudioEntitiesEntityTypeEntityIdImagesGet({
      entityType: 'prop',
      entityId: propId,
      page: 1,
      pageSize: 5,
    })
    const slot = (listed.data?.items ?? [])[0] as unknown as PropImageRow | undefined
    if (!slot) return { error: '未拿到图片槽位' }
    const created = await createAssetImageTask(propId, slot.id, prompt, params.refFileIds ?? [])
    const taskId = created.data?.task_id
    if (!taskId) return { error: '未获取到任务 ID' }
    const done = await pollTask(taskId)
    if (!done.ok) return { error: done.error }
    const refreshed = await StudioEntitiesService.listEntityImagesApiV1StudioEntitiesEntityTypeEntityIdImagesGet({
      entityType: 'prop',
      entityId: propId,
      page: 1,
      pageSize: 5,
    })
    const row = (refreshed.data?.items ?? [])[0] as unknown as PropImageRow | undefined
    if (!row?.file_id) {
      const url = await fetchImageUrlFromTaskResult(taskId)
      return url ? { url } : { error: '生成完成但未取到文件' }
    }
    return { fileId: row.file_id, url: buildFileDownloadUrl(row.file_id) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : '生成失败' }
  }
}
