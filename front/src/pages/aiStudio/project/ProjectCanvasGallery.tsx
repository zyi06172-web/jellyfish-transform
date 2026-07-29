import React, { useEffect, useState } from 'react'
import { Button, Card, Empty, message, Spin, Tag } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { StudioChaptersService, StudioProjectsService, type ChapterRead } from '../../../services/generated'
import {
  DEFAULT_CANVAS_PROMPT,
  DEFAULT_CANVAS_SKILL_KEY,
  createHomePromptIdempotencyKey,
  toHomeProjectCard,
  type HomeProjectCard,
} from './homeProjectCreation'

function withTimeout<T>(promise: Promise<T>, ms = 6000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error('request timeout')), ms)
    }),
  ])
}

/** 多集画布列表：一个画布代表一集，承载新建下一集与进入工作台。 */
const ProjectCanvasGallery: React.FC = () => {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<HomeProjectCard[]>([])
  const [chaptersByProject, setChaptersByProject] = useState<Record<string, ChapterRead[]>>({})
  const [loading, setLoading] = useState(false)
  const [creatingProjectId, setCreatingProjectId] = useState<string | null>(null)

  const newId = (prefix: string) => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
  }

  /** 拉取当前用户项目列表，用作左侧“项目”导航的画布集合。 */
  const loadProjects = async () => {
    setLoading(true)
    try {
      const res = await withTimeout(StudioProjectsService.listProjectsApiV1StudioProjectsGet({
        page: 1,
        pageSize: 36,
      }))
      const nextProjects = (res.data?.items ?? []).map(toHomeProjectCard)
      setProjects(nextProjects)
      const chapterPairs = await Promise.all(nextProjects.map(async (project) => {
        const chapterRes = await withTimeout(StudioChaptersService.listChaptersApiV1StudioChaptersGet({
          projectId: project.id,
          page: 1,
          pageSize: 100,
          order: 'index',
        }))
        return [project.id, chapterRes.data?.items ?? []] as const
      }))
      setChaptersByProject(Object.fromEntries(chapterPairs))
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

  /** 在同一项目内创建下一集 chapter，保持项目级资产库与跨章节复用链路。 */
  const handleCreateNextEpisode = async (project: HomeProjectCard) => {
    setCreatingProjectId(project.id)
    try {
      const existing = chaptersByProject[project.id] ?? []
      const nextIndex = Math.max(0, ...existing.map((chapter) => chapter.index ?? 0)) + 1
      const res = await StudioChaptersService.createChapterApiV1StudioChaptersPost({
        requestBody: {
          id: newId('chapter'),
          project_id: project.id,
          index: nextIndex,
          title: `第 ${nextIndex} 集`,
          summary: '新建剧集画布。继续在同一项目资产库下复用角色圣经、四视图和场景资产。',
          raw_text: '',
          condensed_text: '',
          storyboard_count: 0,
          status: 'draft',
        },
      })
      const created = res.data
      if (!created) throw new Error('empty chapter')
      message.success(`第 ${created.index} 集画布已创建，可直接复用本项目资产库`)
      navigate(`/projects/${created.project_id}?chapterId=${created.id}`)
    } catch {
      message.error('下一集创建失败，请检查后端服务')
    } finally {
      setCreatingProjectId(null)
    }
  }

  /** 没有任何项目时仍复用首页建项目 API 创建第一部剧。 */
  const handleCreateFirstProject = async () => {
    setCreatingProjectId('__new_project__')
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
      message.success('第一部剧已创建，正在分析剧情…')
      navigate(`/projects/${created.project_id}`)
    } catch {
      message.error('项目创建失败，请检查后端服务')
    } finally {
      setCreatingProjectId(null)
    }
  }

  return (
    <div className="relative min-h-full overflow-y-auto bg-transparent text-white">
      <div className="nuwa-deep-space pointer-events-none fixed inset-0" />

      <section className="relative mx-auto w-full max-w-[1180px] px-8 py-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-white/52">项目内多集管理</div>
            <h1 className="mt-2 text-4xl font-semibold tracking-normal text-white">剧集画布</h1>
            <p className="mt-3 max-w-[640px] text-sm leading-relaxed text-white/48">
              一个画布对应一集。新建下一集时复用项目级角色圣经、四视图参考图和场景资产，避免跨集重复出图。
            </p>
          </div>
          <div className="nuwa-mini-create-shell">
            <Button
              type="text"
              loading={!!creatingProjectId}
              icon={<PlusOutlined />}
              disabled={!projects[0]}
              onClick={() => projects[0] && void handleCreateNextEpisode(projects[0])}
              className="nuwa-mini-create-button"
            >
              给最近项目新建下一集
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
            <Button className="mt-5 !border-white/18 !bg-black !text-white" loading={creatingProjectId === '__new_project__'} onClick={() => void handleCreateFirstProject()}>
              创建第一部剧
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => {
              const chapters = chaptersByProject[project.id] ?? []
              return (
              <Card
                key={project.id}
                className="nuwa-canvas-card min-h-[260px] overflow-hidden rounded-[26px] border-white/12 bg-black text-white transition hover:-translate-y-0.5"
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
                    {project.description || '女娲剧集画布'}
                  </div>
                  <div className="mt-4 space-y-2">
                    {chapters.length ? chapters.map((chapter) => (
                      <button
                        key={chapter.id}
                        type="button"
                        onClick={() => navigate(`/projects/${project.id}?chapterId=${chapter.id}`)}
                        className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[.045] px-3 py-2 text-left text-white transition hover:border-white/24 hover:bg-white/[.075]"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{chapter.title || `第 ${chapter.index} 集`}</span>
                          <span className="mt-0.5 block text-xs text-white/42">{chapter.shot_count ?? 0} 镜头 · {chapter.status ?? 'draft'}</span>
                        </span>
                        <span className="text-xs text-white/40">进入</span>
                      </button>
                    )) : (
                      <button
                        type="button"
                        onClick={() => void handleCreateNextEpisode(project)}
                        className="w-full rounded-2xl border border-dashed border-white/18 bg-black px-3 py-3 text-sm text-white/68 transition hover:border-white/30 hover:text-white"
                      >
                        创建第 1 集画布
                      </button>
                    )}
                  </div>
                  <Button
                    block
                    className="mt-4 !border-white/12 !bg-black !text-white"
                    loading={creatingProjectId === project.id}
                    onClick={() => void handleCreateNextEpisode(project)}
                  >
                    新建下一集
                  </Button>
                </div>
              </Card>
            )})}
          </div>
        )}
      </section>
    </div>
  )
}

export default ProjectCanvasGallery
