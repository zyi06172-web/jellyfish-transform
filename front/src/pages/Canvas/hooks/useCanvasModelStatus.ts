import { useEffect, useState } from 'react'
import { LlmService, type ModelRead } from '../../../services/generated'

/** useCanvasModelStatus 读取 DeepSeek / Seedream / Seedance 的前端凭据绑定状态。 */
export function useCanvasModelStatus() {
  const [modelStatus, setModelStatus] = useState<{ text: boolean; image: boolean; video: boolean; labels: string[] }>({
    text: false,
    image: false,
    video: false,
    labels: [],
  })

  useEffect(() => {
    let cancelled = false
    const loadModelStatus = async () => {
      try {
        const [settingsRes, modelsRes] = await Promise.all([
          LlmService.getModelSettingsApiV1LlmModelSettingsGet(),
          LlmService.listModelsApiV1LlmModelsGet({ page: 1, pageSize: 100 }),
        ])
        if (cancelled) return
        const settings = settingsRes.data
        const models = (modelsRes.data?.items ?? []) as ModelRead[]
        const byId = new Map(models.map((model) => [model.id, model]))
        const text = Boolean(settings?.default_text_model_id && byId.get(settings.default_text_model_id))
        const image = Boolean(settings?.default_image_model_id && byId.get(settings.default_image_model_id))
        const video = Boolean(settings?.default_video_model_id && byId.get(settings.default_video_model_id))
        setModelStatus({
          text,
          image,
          video,
          labels: [
            byId.get(settings?.default_text_model_id || '')?.name || 'DeepSeek 未绑定',
            byId.get(settings?.default_image_model_id || '')?.name || 'Seedream 未绑定',
            byId.get(settings?.default_video_model_id || '')?.name || 'Seedance 未绑定',
          ],
        })
      } catch {
        if (!cancelled) setModelStatus({ text: false, image: false, video: false, labels: ['模型配置读取失败'] })
      }
    }
    void loadModelStatus()
    return () => { cancelled = true }
  }, [])

  return modelStatus
}
