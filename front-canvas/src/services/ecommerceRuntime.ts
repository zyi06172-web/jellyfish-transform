import { StudioEntitiesService, StudioFilesService } from './generated'
import { buildFileDownloadUrl } from './fileUrl'
import { pollTask } from './generationRuntime'
import { OpenAPI } from './generated/core/OpenAPI'
import { request as __request } from './generated/core/request'
import type { CancelablePromise } from './generated/core/CancelablePromise'
import { BUILTIN_RECIPES } from '../types/recipes'

/**
 * 电商画布的真实生成链路。
 *
 * 后端没有独立的"商品"实体（研究已确认：只有 actor/scene/prop/costume/character
 * 五种资产类型）。这里复用后端的"道具（prop）"资产类型来承载商品 —— prop 创建时会
 * 按 view_count 自动预置 N 个视角图片槽位（entity_specs.DEFAULT_VIEW_ANGLES =
 * front/left/right/back），恰好可以撑起"产品设定图（白底）+ 多角度扩展"两步真实生成，
 * 复用与短剧道具完全相同的 `image-tasks/assets/prop/{id}/image-tasks` 接口，
 * 不是伪造的假流程。"场景合成/详情页排版/营销海报"这几步后端没有对应能力
 * （不是单图生成能拼出来的，需要图像合成/排版能力），因此仍是占位，交付说明里如实注明。
 */

interface PropImageRow {
  id: number
  view_angle: string
  file_id?: string | null
}

const VIEW_ANGLES = ['front', 'left', 'right', 'back'] as const

export async function uploadReferenceImage(file: File, projectId: string) {
  const res = await StudioFilesService.uploadFileApiApiV1StudioFilesUploadPost({
    formData: { file: file as unknown as string, project_id: projectId, usage_kind: 'ecommerce_reference' },
  })
  return res.data
}

export async function createProductProp(projectId: string, name: string, description: string) {
  const id = crypto.randomUUID()
  await StudioEntitiesService.createEntityApiV1StudioEntitiesEntityTypePost({
    entityType: 'prop',
    requestBody: {
      id,
      name,
      description,
      tags: ['ecommerce'],
      view_count: 4,
      style: '真人都市',
      visual_style: '现实',
      project_id: projectId,
    },
  })
  return id
}

export async function listPropImages(propId: string): Promise<PropImageRow[]> {
  const res = await StudioEntitiesService.listEntityImagesApiV1StudioEntitiesEntityTypeEntityIdImagesGet({
    entityType: 'prop',
    entityId: propId,
    page: 1,
    pageSize: 10,
  })
  return ((res.data?.items ?? []) as unknown as PropImageRow[]).sort((a, b) => VIEW_ANGLES.indexOf(a.view_angle as never) - VIEW_ANGLES.indexOf(b.view_angle as never))
}

function renderProductSheetPrompt(productName: string, description: string, angle: string) {
  const recipe = BUILTIN_RECIPES.find((r) => r.id === 'ecommerce-product-sheet')!
  const angleHint = angle === 'front' ? 'front hero view' : angle === 'left' ? '45-degree left view' : angle === 'right' ? '45-degree right view' : 'back view'
  return recipe.template
    .replace('{product_name}', productName)
    .replace('{product_description}', description || productName)
    .replace('{material_details}', '（由用户参考图与描述推断）')
    .replace('{aspect_ratio}', '1:1')
    .concat(`\nCamera angle: ${angleHint}.`)
}

interface AssetImageTaskCreated {
  task_id: string
}
interface ApiEnvelope<T> {
  data?: T
}

function createAssetImageTask(propId: string, imageId: number, prompt: string, refFileIds: string[]): CancelablePromise<ApiEnvelope<AssetImageTaskCreated>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/image-tasks/assets/{asset_type}/{asset_id}/image-tasks',
    path: { asset_type: 'prop', asset_id: propId },
    body: { image_id: imageId, prompt, images: refFileIds },
    mediaType: 'application/json',
  })
}

/** 生成产品设定图（白底 hero 图，view_angle=front 槽位） */
export async function generateProductHero(propId: string, productName: string, description: string, refFileId?: string) {
  const images = await listPropImages(propId)
  const frontSlot = images.find((i) => i.view_angle === 'front')
  if (!frontSlot) return { error: '未找到 front 图片槽位' }
  const prompt = renderProductSheetPrompt(productName, description, 'front')
  const created = await createAssetImageTask(propId, frontSlot.id, prompt, refFileId ? [refFileId] : [])
  const taskId = created.data?.task_id
  if (!taskId) return { error: '未获取到任务 ID' }
  const done = await pollTask(taskId)
  if (!done.ok) return { error: done.error }
  const refreshed = await listPropImages(propId)
  const done1 = refreshed.find((i) => i.view_angle === 'front')
  return { fileId: done1?.file_id ?? undefined, url: done1?.file_id ? buildFileDownloadUrl(done1.file_id) : undefined }
}

/** 生成剩余 3 个角度（多角度扩展），复用同一个 prop 的其余槽位 */
export async function generateProductMultiAngle(propId: string, productName: string, description: string) {
  const images = await listPropImages(propId)
  const targets = images.filter((i) => i.view_angle !== 'front')
  const results: Record<string, { url?: string; error?: string }> = {}
  for (const slot of targets) {
    const prompt = renderProductSheetPrompt(productName, description, slot.view_angle)
    const created = await createAssetImageTask(propId, slot.id, prompt, [])
    const taskId = created.data?.task_id
    if (!taskId) {
      results[slot.view_angle] = { error: '未获取到任务 ID' }
      continue
    }
    const done = await pollTask(taskId)
    if (!done.ok) {
      results[slot.view_angle] = { error: done.error }
      continue
    }
    const refreshed = await listPropImages(propId)
    const row = refreshed.find((i) => i.id === slot.id)
    results[slot.view_angle] = { url: row?.file_id ? buildFileDownloadUrl(row.file_id) : undefined }
  }
  return results
}
