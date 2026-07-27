import React, { useEffect, useState } from 'react'
import { Button, Card, Empty, message, Spin, Tag } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { StudioProjectsService } from '../../../services/generated'
import {
  DEFAULT_CANVAS_PROMPT,
  DEFAULT_CANVAS_SKILL_KEY,
  createHomePromptIdempotencyKey,
  toHomeProjectCard,
  type HomeProjectCard,
} from './homeProjectCreation'

/** 项目画布列表：承载用户已创建项目，并提供进入工作台的真实入口。 */
const ProjectCanvasGallery: React.FC = () => {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<HomeProjectCard[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)

  /** 拉取当前用户项目列表，用作左侧“项目”导航的画布集合。 */
  const loadProjects = async () => {
    setLoading(true)
    try {
      const res = await StudioProjectsService.listProjectsApiV1StudioProjectsGet({
        page: 1,
        pageSize: 36,
      })
      setProjects((res.data?.items ?? []).map(toHomeProjectCard))
    } catch {
      setProjects([])
      message.error('画布列表加载失败，请检查后端服务')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadProjects()
  }, [])

  /** 在项目页创建新画布，创建成功后直接进入项目工作台。 */
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
    <div className="relative min-h-full overflow-y-auto bg-transparent text-white">
      <div className="nuwa-deep-space pointer-events-none fixed inset-0" />

      <section className="relative mx-auto w-full max-w-[1180px] px-8 py-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-white/52">项目</div>
            <h1 className="mt-2 text-4xl font-semibold tracking-normal text-white">画布</h1>
          </div>
          <div className="nuwa-mini-create-shell">
            <Button
              type="text"
              loading={creating}
              icon={<PlusOutlined />}
              onClick={() => void handleCreateCanvas()}
              className="nuwa-mini-create-button"
            >
              创建画布
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[360px] items-center justify-center">
            <Spin />
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-[28px] border border-white/10 bg-black p-12 text-center shadow-[0_0_36px_rgba(125,211,252,.08)]">
            <Empty description={<span className="text-white/54">还没有画布</span>} />
            <Button className="mt-5 !border-white/18 !bg-black !text-white" onClick={() => void handleCreateCanvas()}>
              创建第一个画布
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <Card
                key={project.id}
                onClick={() => navigate(`/projects/${project.id}`)}
                className="nuwa-canvas-card min-h-[184px] cursor-pointer overflow-hidden rounded-[26px] border-white/12 bg-black text-white transition hover:-translate-y-0.5"
                bodyStyle={{ padding: 0 }}
              >
                <div className="h-[88px] border-b border-white/8 bg-[radial-gradient(circle_at_20%_24%,rgba(255,255,255,.24),transparent_18%),radial-gradient(circle_at_78%_34%,rgba(125,211,252,.18),transparent_22%),#000]" />
                <div className="p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <Tag className="mr-0 rounded-full border border-white/12 bg-black px-3 text-white">
                      已分析 {project.progress}%
                    </Tag>
                  </div>
                  <div className="truncate text-lg font-semibold text-white">{project.name}</div>
                  <div className="mt-2 line-clamp-2 text-sm leading-relaxed text-white/46">
                    {project.description || '女娲创作画布'}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default ProjectCanvasGallery
