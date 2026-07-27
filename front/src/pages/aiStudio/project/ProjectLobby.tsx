import React, { useState } from 'react'
import { Button, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { StudioProjectsService } from '../../../services/generated'
import {
  DEFAULT_CANVAS_PROMPT,
  DEFAULT_CANVAS_SKILL_KEY,
  createHomePromptIdempotencyKey,
} from './homeProjectCreation'

/** 女娲首页：只保留创作入口，把项目画布列表交给“项目”导航承载。 */
const ProjectLobby: React.FC = () => {
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)

  /** 创建一个可继续补充剧本与资产的画布，并直接进入项目工作台。 */
  const handleCreateCanvas = async () => {
    setCreating(true)
    try {
      const res = await StudioProjectsService.createProjectFromPromptApiV1StudioProjectsFromPromptPost({
        requestBody: {
          prompt: DEFAULT_CANVAS_PROMPT,
          skill_key: DEFAULT_CANVAS_SKILL_KEY,
          idempotency_key: createHomePromptIdempotencyKey(),
        },
      })
      const created = res.data
      if (!created) throw new Error('empty project')
      message.success('画布已创建，正在分析剧情…')
      navigate(`/projects/${created.project_id}`)
    } catch {
      message.error('画布创建失败，请检查后端服务')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="relative h-full overflow-y-auto bg-transparent text-white">
      <div className="nuwa-deep-space pointer-events-none fixed inset-0" />

      <section className="relative flex min-h-full px-8 py-8">
        <div className="relative mx-auto flex w-full max-w-[1180px] flex-col items-center">
          <div className="mb-12 flex w-full items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold text-white/55">智能视频创作助理</div>
              <div className="mt-1 text-base font-semibold text-white">女娲 AI 影像工作台</div>
            </div>
            <div className="rounded-full border border-white/16 bg-black px-5 py-2 text-xs font-semibold text-white shadow-[0_0_26px_rgba(125,211,252,.12)]">
              当前计划：免费版
            </div>
          </div>

          <div className="flex flex-1 flex-col items-center justify-center pb-24 text-center">
            <h1 className="max-w-[980px] text-5xl font-semibold leading-[1.03] tracking-normal text-white md:text-[76px]">
              <span className="block">从一句灵感</span>
              <span className="block">生成完整影像资产链</span>
            </h1>
            <p className="mt-6 max-w-[720px] text-lg leading-relaxed text-white/58">
              把剧本交给女娲，它会沉淀角色圣经、资产库、故事板、镜头分组和视频提示词，让每一集都能沿着同一套视觉资产继续生长。
            </p>

            <div className="nuwa-create-canvas-shell mt-12">
              <Button
                type="text"
                size="large"
                loading={creating}
                icon={<PlusOutlined />}
                onClick={() => void handleCreateCanvas()}
                className="nuwa-create-canvas-button"
              >
                创建画布
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default ProjectLobby
