import { FilmService, StudioImageTasksService, StudioShotFrameImagesService } from './generated'
import type { StoryboardPanel } from './workflowArtifacts'
import { buildFileDownloadUrl } from './fileUrl'

/** 关键帧渲染 / 视频生成的直连后端调用（研究已确认这两步不经过 agent 对话，
 *  是独立可调用的真实接口）。画幅比例统一从项目/分镜设置解析，不再硬编码 9:16
 *  （原则5）。 */
export function resolveAspectRatio(projectDefaultRatio?: string | null, overrideRatio?: string | null): string {
  return overrideRatio || projectDefaultRatio || '16:9'
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 轮询任务直到 succeeded/failed/cancelled，超时兜底避免无限等待 */
export async function pollTask(taskId: string, { intervalMs = 1500, timeoutMs = 180000 } = {}): Promise<{ ok: boolean; error?: string }> {
  const start = Date.now()
  for (;;) {
    const res = await FilmService.getTaskStatusApiV1FilmTasksTaskIdStatusGet({ taskId })
    const status = res.data?.status
    if (status === 'succeeded') return { ok: true }
    if (status === 'failed' || status === 'cancelled') {
      const result = await FilmService.getTaskResultApiV1FilmTasksTaskIdResultGet({ taskId }).catch(() => undefined)
      return { ok: false, error: result?.data?.error || '任务失败' }
    }
    if (Date.now() - start > timeoutMs) return { ok: false, error: '生成超时，请重试' }
    await sleep(intervalMs)
  }
}

/** 从通用任务结果里尽量提取图片 URL，作为本地文件存储未配置时的后备显示源。 */
export async function fetchImageUrlFromTaskResult(taskId: string): Promise<string | undefined> {
  const result = await FilmService.getTaskResultApiV1FilmTasksTaskIdResultGet({ taskId }).catch(() => undefined)
  const payload = result?.data?.result as { images?: Array<{ url?: string }>; url?: string } | undefined
  return payload?.images?.find((image) => image.url)?.url || payload?.url
}

/** 关键帧：per-shot frame_type='key'，seed 概念后端未落库（已在交付说明中标注为已知差距）*/
export async function generateKeyframeForPanel(params: {
  shotId: string
  prompt: string
  ratio: string
  refFileIds?: string[]
}): Promise<{ fileId?: string; url?: string; error?: string }> {
  try {
    const created = await StudioImageTasksService.createShotFrameImageGenerationTaskApiV1StudioImageTasksShotShotIdFrameImageTasksPost({
      shotId: params.shotId,
      requestBody: {
        frame_type: 'key',
        prompt: params.prompt,
        target_ratio: params.ratio as never,
        images: (params.refFileIds ?? []).map((fid) => ({ type: 'character', id: '', file_id: fid, name: '' }) as never),
      },
    })
    const taskId = created.data?.task_id
    if (!taskId) return { error: '未获取到任务 ID' }
    const done = await pollTask(taskId)
    if (!done.ok) return { error: done.error }
    const listed = await StudioShotFrameImagesService.listShotFrameImagesApiV1StudioShotFrameImagesGet({ shotDetailId: params.shotId, order: '-id', pageSize: 1 })
    const row = listed.data?.items?.[0]
    if (!row?.file_id) {
      const url = await fetchImageUrlFromTaskResult(taskId)
      return url ? { url } : { error: '生成完成但未取到文件' }
    }
    return { fileId: row.file_id, url: buildFileDownloadUrl(row.file_id) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : '生成失败' }
  }
}

export function buildKeyframePrompt(panel: StoryboardPanel): string {
  const six = panel.six_elements_for_video_model
  const parts = [panel.visible_summary]
  if (six) {
    for (const [, field] of Object.entries(six)) {
      if (field?.value) parts.push(field.value)
    }
  }
  return `Ultra-realistic key frame render for short-drama shot ${panel.shot_index}. ${parts.filter(Boolean).join('. ')}. Cinematic lighting, photorealistic, high detail.`
}

/** 视频：images 留空，后端按 shot_id + reference_mode 自动复用已生成的关键帧（原则3，单一数据源） */
export async function generateVideoForShot(params: { shotId: string; ratio: string; prompt?: string }): Promise<{ taskId?: string; error?: string }> {
  try {
    const created = await FilmService.createVideoGenerationTaskApiV1FilmTasksVideoPost({
      requestBody: {
        shot_id: params.shotId,
        reference_mode: 'key',
        prompt: params.prompt,
        images: [],
        ratio: params.ratio as never,
      },
    })
    return { taskId: created.data?.task_id }
  } catch (e) {
    return { error: e instanceof Error ? e.message : '出视频失败' }
  }
}

export async function fetchVideoResult(taskId: string): Promise<{ url?: string; fileId?: string; error?: string }> {
  const done = await pollTask(taskId, { timeoutMs: 300000 })
  if (!done.ok) return { error: done.error }
  const result = await FilmService.getTaskResultApiV1FilmTasksTaskIdResultGet({ taskId })
  const r = result.data?.result as { url?: string; file_id?: string } | undefined
  const fileId = r?.file_id
  return { url: r?.url || (fileId ? buildFileDownloadUrl(fileId) : undefined), fileId }
}
