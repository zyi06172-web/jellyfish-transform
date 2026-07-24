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
  icon: string
  hot?: boolean
}> = [
  {
    key: 'long_video',
    title: '长视频制作',
    subtitle: '适合完整叙事、系列节目和品牌纪录片',
    accent: 'linear-gradient(135deg, rgba(33,150,243,.16), rgba(76,217,100,.10))',
    icon: '🎬',
  },
  {
    key: 'commercial',
    title: '商业广告制作',
    subtitle: '围绕产品卖点生成脚本、镜头和投放素材',
    accent: 'linear-gradient(135deg, rgba(255,149,0,.24), rgba(0,122,255,.12))',
    icon: '🧴',
    hot: true,
  },
  {
    key: 'short_drama',
    title: '短剧制作',
    subtitle: '爽点、反转、付费卡点和竖屏分镜',
    accent: 'linear-gradient(135deg, rgba(175,82,222,.20), rgba(90,200,250,.13))',
    icon: '🎭',
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
    <div className="relative h-full overflow-y-auto bg-[#f5f5f7] text-[#1d1d1f]">
      <div className="pointer-events-none fixed inset-y-0 left-[104px] right-0 bg-[radial-gradient(circle_at_16%_0%,rgba(255,45,85,.15),transparent_28%),radial-gradient(circle_at_39%_-7%,rgba(255,149,0,.13),transparent_24%),radial-gradient(circle_at_62%_-4%,rgba(52,199,89,.15),transparent_25%),radial-gradient(circle_at_86%_3%,rgba(0,122,255,.17),transparent_30%),linear-gradient(180deg,#ffffff_0%,#f8f9fb_56%,#f5f5f7_100%)]" />
      <div className="pointer-events-none fixed left-1/2 top-7 h-[390px] w-[720px] -translate-x-1/2 rounded-full bg-[conic-gradient(from_190deg,rgba(255,45,85,.09),rgba(255,149,0,.075),rgba(52,199,89,.085),rgba(90,200,250,.11),rgba(175,82,222,.085),rgba(255,45,85,.09))] blur-3xl" />

      <section className="relative px-8 pb-7 pt-8">
        <div className="relative mx-auto flex max-w-[1120px] flex-col items-center">
          <div className="mb-8 flex w-full items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold text-black/42">AI 视频创作 Agent</div>
              <div className="mt-1 text-base font-semibold">短剧工厂</div>
            </div>
            <div className="rounded-full border border-black/5 bg-white/70 px-4 py-2 text-xs font-semibold text-black/56 shadow-sm backdrop-blur-2xl">
              当前计划：Free
            </div>
          </div>

          <h1 className="max-w-[900px] text-center text-5xl font-semibold leading-[1.08] tracking-normal text-[#1d1d1f] md:text-[76px]">
            一段剧情，即刻视频生产线。
          </h1>
          <p className="mt-5 max-w-[660px] text-center text-lg leading-relaxed text-black/43">
            把灵感交给 Agent，它会理解叙事意图，整理角色与镜头，并把每一次创作沉淀成可继续推进的项目。
          </p>

          <div className="mt-10 w-full max-w-[920px] rounded-[32px] border border-black/8 bg-white/78 p-5 shadow-[0_26px_76px_rgba(0,0,0,.09)] backdrop-blur-2xl">
            <Input.TextArea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              autoSize={{ minRows: 4, maxRows: 8 }}
              bordered={false}
              className="flova-home-input text-[20px]"
              placeholder="想做什么视频？例如：女主被迫离婚后发现自己才是豪门继承人..."
              onPressEnter={(event) => {
                if ((event.metaKey || event.ctrlKey) && !creating) {
                  void handleCreateFromPrompt()
                }
              }}
            />
            <div className="mt-6 flex flex-wrap items-center gap-3">
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

          <div className="mt-7 grid w-full max-w-[920px] grid-cols-1 gap-3 md:grid-cols-3">
            {skillCards.map((skill) => (
              <button
                key={skill.key}
                type="button"
                onClick={() => setSelectedSkill(skill.key)}
                className={`relative flex h-[72px] items-center gap-3 overflow-visible rounded-[22px] border px-4 text-left transition ${
                  selectedSkill === skill.key
                    ? 'border-black/10 bg-[#1d1d1f] text-white shadow-[0_22px_56px_rgba(0,0,0,.16)]'
                    : 'border-black/8 bg-white text-[#1d1d1f] shadow-[0_10px_28px_rgba(0,0,0,.055)] hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(0,0,0,.09)]'
                }`}
                style={{ backgroundImage: selectedSkill === skill.key ? skill.accent : undefined }}
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg ${
                  selectedSkill === skill.key ? 'bg-white/18' : 'bg-black/[.055]'
                }`}>
                  {skill.icon}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold">{skill.title}</div>
                  <div className={`truncate text-xs ${selectedSkill === skill.key ? 'text-white/62' : 'text-black/40'}`}>
                    {skill.subtitle}
                  </div>
                </div>
                {skill.hot ? (
                  <span className={`absolute -top-3 right-4 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    selectedSkill === skill.key ? 'bg-white text-[#1d1d1f]' : 'bg-[#1d1d1f] text-white'
                  }`}>
                    推荐
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="relative mx-auto w-full max-w-[1120px] px-8 pb-16 pt-1">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-semibold tracking-normal">最近项目</h2>
          <Button type="text" className="text-sm text-black/45">
            查看全部
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <button
            type="button"
            onClick={() => document.querySelector<HTMLTextAreaElement>('.flova-home-input textarea')?.focus()}
            className="flex min-h-[168px] items-center justify-center rounded-[30px] border border-dashed border-black/16 bg-white/48 text-black/38 transition hover:border-black/26 hover:bg-white"
          >
            <span className="flex h-13 w-13 items-center justify-center rounded-full border border-black/16 text-3xl">
              +
            </span>
          </button>
          {projects.map((project) => (
            <Card
              key={project.id}
              loading={loadingProjects}
              onClick={() => navigate(`/projects/${project.id}`)}
              className="flova-project-card min-h-[168px] cursor-pointer overflow-hidden rounded-[30px] border-black/5 bg-white"
              bodyStyle={{ padding: 0 }}
            >
              <div className="h-[92px] bg-[radial-gradient(circle_at_26%_26%,rgba(255,255,255,.85),transparent_21%),linear-gradient(135deg,rgba(0,122,255,.18),rgba(52,199,89,.14),rgba(255,149,0,.12))]" />
              <div className="p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Tag className="mr-0 rounded-full border-0 bg-black/[.06] px-3 text-black/58">
                    已分析 {project.progress}%
                  </Tag>
                </div>
                <div className="truncate text-base font-semibold text-[#1d1d1f]">{project.name}</div>
                <div className="mt-1 line-clamp-1 text-xs text-black/42">{project.description || 'Agent 创建的项目'}</div>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  )
}

export default ProjectLobby
