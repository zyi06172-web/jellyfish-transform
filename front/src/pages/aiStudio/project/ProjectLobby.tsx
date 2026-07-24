import React, { useEffect, useMemo, useState } from 'react'
import { Button, Card, Input, message, Select, Tag } from 'antd'
import {
  ArrowUpOutlined,
  AudioOutlined,
  GiftOutlined,
  PlusOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { StudioProjectsService } from '../../../services/generated'
import type { ProjectRead, ProjectStyle } from '../../../services/generated'

type SkillMode = 'long_video' | 'commercial' | 'short_drama'

type ProjectCard = {
  id: string
  name: string
  description: string
  updatedAt: string
  progress: number
}

const skillCards: Array<{
  key: SkillMode
  title: string
  subtitle: string
  accent: string
  hot?: boolean
}> = [
  {
    key: 'long_video',
    title: '长视频制作',
    subtitle: '适合完整叙事、系列节目和品牌纪录片',
    accent: 'from-[#a7f3d0] via-[#bfdbfe] to-[#f5f5f7]',
  },
  {
    key: 'commercial',
    title: '商业广告制作',
    subtitle: '围绕产品卖点生成脚本、镜头和投放素材',
    accent: 'from-[#fed7aa] via-[#dbeafe] to-[#f5f5f7]',
    hot: true,
  },
  {
    key: 'short_drama',
    title: '短剧制作',
    subtitle: '爽点、反转、付费卡点和竖屏分镜',
    accent: 'from-[#ddd6fe] via-[#bfdbfe] to-[#ccfbf1]',
    hot: true,
  },
]

/** 生成稳定的本地项目 ID，继续沿用现有项目创建 API。 */
function newProjectId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `p_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

/** 模拟 Agent 对剧情大纲的标题总结，先实现首页输入后自动留档。 */
function summarizeTitle(prompt: string, mode: SkillMode) {
  const cleaned = prompt
    .replace(/\s+/g, ' ')
    .replace(/[“”"'《》]/g, '')
    .trim()
  const firstClause = cleaned.split(/[，。！？,.!?；;]/)[0]?.trim()
  if (firstClause && firstClause.length >= 4) {
    return firstClause.length > 18 ? `${firstClause.slice(0, 18)}...` : firstClause
  }
  const fallback: Record<SkillMode, string> = {
    long_video: '未命名长视频项目',
    commercial: '未命名广告项目',
    short_drama: '未命名短剧项目',
  }
  return fallback[mode]
}

/** 将后端项目读取结果压成首页最近项目需要的轻量卡片。 */
function toProjectCard(project: ProjectRead): ProjectCard {
  const stats = (project.stats ?? {}) as Record<string, unknown>
  const updatedAt =
    (typeof stats.updated_at === 'string' && stats.updated_at) ||
    (typeof stats.updatedAt === 'string' && stats.updatedAt) ||
    new Date().toLocaleString()
  return {
    id: project.id,
    name: project.name,
    description: project.description ?? '',
    updatedAt,
    progress: project.progress ?? 0,
  }
}

const ProjectLobby: React.FC = () => {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<ProjectCard[]>([])
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState('默认创作模型')
  const [selectedSkill, setSelectedSkill] = useState<SkillMode>('short_drama')
  const [creating, setCreating] = useState(false)
  const [loadingProjects, setLoadingProjects] = useState(false)

  const selectedSkillInfo = useMemo(
    () => skillCards.find((item) => item.key === selectedSkill) ?? skillCards[2],
    [selectedSkill],
  )

  const loadProjects = async () => {
    setLoadingProjects(true)
    try {
      const res = await StudioProjectsService.listProjectsApiV1StudioProjectsGet({
        page: 1,
        pageSize: 12,
      })
      setProjects((res.data?.items ?? []).map(toProjectCard))
    } catch {
      setProjects([])
    } finally {
      setLoadingProjects(false)
    }
  }

  useEffect(() => {
    void loadProjects()
  }, [])

  const handleCreateFromPrompt = async () => {
    const content = prompt.trim()
    if (!content) {
      message.warning('先写一段剧情大纲或视频需求')
      return
    }
    setCreating(true)
    try {
      const name = summarizeTitle(content, selectedSkill)
      const id = newProjectId()
      const res = await StudioProjectsService.createProjectApiV1StudioProjectsPost({
        requestBody: {
          id,
          name,
          description: [
            `Skill: ${selectedSkillInfo.title}`,
            `Model: ${model}`,
            '',
            content,
          ].join('\n'),
          style: '真人都市' as ProjectStyle,
          visual_style: '现实',
          seed: Math.floor(Math.random() * 99999),
          unify_style: true,
          default_video_ratio: selectedSkill === 'short_drama' ? '9:16' : '16:9',
          progress: 8,
        },
      })
      const created = res.data
      if (!created) throw new Error('empty project')
      message.success(`已创建项目：${created.name}`)
      setProjects((prev) => [toProjectCard(created), ...prev])
      setPrompt('')
      navigate(`/projects/${created.id}`)
    } catch {
      message.error('项目创建失败，请检查后端服务')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-[#f5f5f7] text-[#1d1d1f]">
      <section className="relative min-h-[62vh] px-8 pb-12 pt-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(0,122,255,.12),transparent_28%),radial-gradient(circle_at_82%_4%,rgba(52,199,89,.13),transparent_32%),linear-gradient(180deg,#ffffff,#f5f5f7_72%)]" />
        <div className="relative mx-auto flex max-w-[1180px] flex-col items-center">
          <div className="mb-9 flex w-full items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-black/45">AI 视频创作 Agent</div>
              <div className="mt-1 text-lg font-semibold">短剧工厂</div>
            </div>
            <div className="rounded-full border border-black/5 bg-white/70 px-4 py-2 text-sm font-semibold text-black/56 shadow-sm backdrop-blur-2xl">
              当前计划：Free
            </div>
          </div>

          <h1 className="max-w-[980px] text-center text-6xl font-semibold leading-[1.08] tracking-normal text-[#1d1d1f] md:text-7xl">
            用一句剧情大纲，启动一条视频生产线。
          </h1>
          <p className="mt-6 max-w-[700px] text-center text-xl leading-relaxed text-black/45">
            输入故事、广告创意或长视频想法。Agent 会总结标题、创建项目，并把它放进最近项目里，方便你继续制作。
          </p>

          <div className="mt-12 w-full max-w-[960px] rounded-[34px] border border-black/8 bg-white/78 p-5 shadow-[0_30px_90px_rgba(0,0,0,.10)] backdrop-blur-2xl">
            <Input.TextArea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              autoSize={{ minRows: 4, maxRows: 8 }}
              bordered={false}
              className="flova-home-input text-[22px]"
              placeholder="想做什么视频？例如：女主被迫离婚后发现自己才是豪门继承人..."
              onPressEnter={(event) => {
                if ((event.metaKey || event.ctrlKey) && !creating) {
                  void handleCreateFromPrompt()
                }
              }}
            />
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button shape="circle" icon={<PlusOutlined />} className="apple-circle-button" />
              <Select
                value={model}
                onChange={setModel}
                className="apple-pill-select min-w-[160px]"
                options={[
                  { value: '默认创作模型', label: '模型　默认' },
                  { value: 'Seed 2.0', label: 'Seed 2.0' },
                  { value: 'Veo', label: 'Veo' },
                ]}
              />
              <Button className="apple-pill-button" icon={<GiftOutlined />}>
                Skill
              </Button>
              <Button className="apple-pill-button" icon={<VideoCameraOutlined />}>
                资产库
              </Button>
              <div className="ml-auto flex items-center gap-3">
                <Button shape="circle" icon={<AudioOutlined />} className="apple-circle-button" />
                <Button
                  shape="circle"
                  size="large"
                  loading={creating}
                  icon={<ArrowUpOutlined />}
                  onClick={() => void handleCreateFromPrompt()}
                  className="border-none bg-[#1d1d1f] text-white shadow-lg shadow-black/20"
                />
              </div>
            </div>
          </div>

          <div className="mt-10 text-center text-base font-semibold text-black/38">选择制作风格</div>
          <div className="mt-5 grid w-full max-w-[1000px] grid-cols-1 gap-4 md:grid-cols-3">
            {skillCards.map((skill) => (
              <button
                key={skill.key}
                type="button"
                onClick={() => setSelectedSkill(skill.key)}
                className={`relative flex min-h-[132px] flex-col justify-between rounded-[28px] border p-6 text-left shadow-sm transition ${
                  selectedSkill === skill.key
                    ? 'border-black/10 bg-white shadow-[0_22px_60px_rgba(0,0,0,.10)]'
                    : 'border-black/5 bg-white/58 hover:bg-white hover:shadow-[0_18px_44px_rgba(0,0,0,.08)]'
                }`}
              >
                <div className={`absolute inset-x-4 top-4 h-12 rounded-2xl bg-gradient-to-r ${skill.accent} opacity-80`} />
                <div className="relative mt-12">
                  <div className="text-xl font-semibold text-[#1d1d1f]">{skill.title}</div>
                  <div className="mt-2 text-sm leading-relaxed text-black/45">{skill.subtitle}</div>
                </div>
                {skill.hot ? (
                  <span className="absolute right-5 top-5 rounded-full bg-black px-3 py-1 text-xs font-bold text-white">
                    推荐
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1180px] px-8 pb-16">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-3xl font-semibold tracking-normal">最近项目</h2>
          <Button type="text" className="text-black/45">
            查看全部
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <button
            type="button"
            onClick={() => document.querySelector<HTMLTextAreaElement>('.flova-home-input textarea')?.focus()}
            className="flex min-h-[190px] items-center justify-center rounded-[32px] border border-dashed border-black/18 bg-white/52 text-black/42 transition hover:border-black/30 hover:bg-white"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full border border-black/18 text-4xl">
              +
            </span>
          </button>
          {projects.map((project) => (
            <Card
              key={project.id}
              loading={loadingProjects}
              onClick={() => navigate(`/projects/${project.id}`)}
              className="flova-project-card min-h-[190px] cursor-pointer overflow-hidden rounded-[32px] border-black/5 bg-white"
              bodyStyle={{ padding: 0 }}
            >
              <div className="h-[108px] bg-[radial-gradient(circle_at_26%_26%,rgba(255,255,255,.85),transparent_21%),linear-gradient(135deg,rgba(0,122,255,.18),rgba(52,199,89,.14),rgba(255,149,0,.12))]" />
              <div className="p-5">
                <div className="mb-2 flex items-center gap-2">
                  <Tag className="mr-0 rounded-full border-0 bg-black/[.06] px-3 text-black/58">
                    已分析 {project.progress}%
                  </Tag>
                </div>
                <div className="truncate text-lg font-semibold text-[#1d1d1f]">{project.name}</div>
                <div className="mt-1 line-clamp-1 text-sm text-black/42">{project.description || 'Agent 创建的项目'}</div>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  )
}

export default ProjectLobby
