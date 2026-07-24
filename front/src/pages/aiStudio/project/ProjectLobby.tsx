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
  image: string
  hot?: boolean
}> = [
  {
    key: 'long_video',
    title: '长视频制作',
    subtitle: '章节化叙事、连续镜头与完整成片',
    image: 'linear-gradient(135deg, rgba(20,184,166,.32), rgba(37,99,235,.22))',
  },
  {
    key: 'commercial',
    title: '商业广告制作',
    subtitle: '产品卖点、广告脚本与高转化素材',
    image: 'linear-gradient(135deg, rgba(249,115,22,.34), rgba(37,99,235,.20))',
    hot: true,
  },
  {
    key: 'short_drama',
    title: '短剧制作',
    subtitle: '爽点、反转、付费卡点和竖屏分镜',
    image: 'linear-gradient(135deg, rgba(168,85,247,.30), rgba(20,184,166,.20))',
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

/** 模拟 Agent 对剧情大纲的标题总结，先实现 Flova 式留档体验。 */
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
    long_video: '未命名长视频企划',
    commercial: '未命名广告企划',
    short_drama: '未命名短剧企划',
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
  const [model, setModel] = useState('Nano Banana')
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
      message.success(`Agent 已创建项目：${created.name}`)
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
    <div className="min-h-full overflow-y-auto bg-[#050505] text-white">
      <div className="relative min-h-[62vh] px-6 pt-8 pb-9">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_8%,rgba(249,115,22,.24),transparent_30%),radial-gradient(circle_at_78%_2%,rgba(20,184,166,.20),transparent_32%),linear-gradient(180deg,rgba(255,255,255,.04),rgba(0,0,0,.88))]" />
        <div className="relative mx-auto flex max-w-[1320px] flex-col items-center">
          <div className="mb-8 flex w-full items-center justify-end gap-4">
            <div className="hidden rounded-full border border-white/15 bg-gradient-to-r from-[#3c5f2f] to-[#2c63a4] px-7 py-2 text-sm font-semibold text-[#ffd99b] shadow-lg md:block">
              💰 AI广告コンテスト。最大11,500ドルを勝ち取れ！
            </div>
            <div className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold backdrop-blur">
              🪙 87 <span className="mx-2 text-white/30">|</span> Free
            </div>
          </div>

          <h1 className="text-center font-serif text-5xl leading-tight tracking-normal text-white md:text-7xl">
            Flova 1.0 — あなた専属のAI動画クリエイティブ
          </h1>
          <div className="mt-7 text-center font-serif text-5xl text-white md:text-7xl">
            Agent
          </div>
          <p className="mt-6 text-center text-lg tracking-wide text-white/42">
            ワークフローと感性をSkillに。あなたらしく動くAI。
          </p>

          <div className="mt-14 w-full max-w-[980px] rounded-[28px] border border-[#a9c86b]/70 bg-black/72 p-6 shadow-[0_0_80px_rgba(117,143,71,.14)] backdrop-blur">
            <Input.TextArea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              autoSize={{ minRows: 4, maxRows: 8 }}
              bordered={false}
              className="flova-home-input text-[22px]"
              placeholder="どんな動画を作りますか？"
              onPressEnter={(event) => {
                if ((event.metaKey || event.ctrlKey) && !creating) {
                  void handleCreateFromPrompt()
                }
              }}
            />
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button shape="circle" ghost icon={<PlusOutlined />} />
              <Select
                value={model}
                onChange={setModel}
                className="flova-pill-select min-w-[174px]"
                popupClassName="flova-dark-select"
                options={[
                  { value: 'Nano Banana', label: '⌘ モデル　新規' },
                  { value: 'Seed 2.0', label: 'Seed 2.0' },
                  { value: 'Veo', label: 'Veo' },
                ]}
              />
              <Button ghost className="flova-pill-button" icon={<GiftOutlined />}>
                Skill
              </Button>
              <Button ghost className="flova-pill-button" icon={<VideoCameraOutlined />}>
                アセットライブラリ
              </Button>
              <div className="ml-auto flex items-center gap-3">
                <Button shape="circle" ghost icon={<AudioOutlined />} />
                <Button
                  shape="circle"
                  size="large"
                  loading={creating}
                  icon={<ArrowUpOutlined />}
                  onClick={() => void handleCreateFromPrompt()}
                  className="border-none bg-gradient-to-br from-[#c7b79b] to-[#8b9972] text-black"
                />
              </div>
            </div>
          </div>

          <div className="mt-9 text-center text-base font-semibold text-white/36">人気のスキル</div>
          <div className="mt-5 grid w-full max-w-[1180px] grid-cols-1 gap-4 md:grid-cols-3">
            {skillCards.map((skill) => (
              <button
                key={skill.key}
                type="button"
                onClick={() => setSelectedSkill(skill.key)}
                className={`relative flex h-[78px] items-center gap-4 rounded-2xl border px-6 text-left transition ${
                  selectedSkill === skill.key
                    ? 'border-[#a7c26e]/80 bg-white/[.13]'
                    : 'border-white/12 bg-white/[.045] hover:border-white/28'
                }`}
                style={{ backgroundImage: selectedSkill === skill.key ? skill.image : undefined }}
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-black/35 text-xl">
                  {skill.key === 'long_video' ? '🎞️' : skill.key === 'commercial' ? '🧴' : '🎭'}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-lg font-semibold text-white">{skill.title}</div>
                  <div className="truncate text-sm text-white/44">{skill.subtitle}</div>
                </div>
                {skill.hot ? (
                  <span className="absolute -top-3 right-5 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-[#ffd28a]">
                    人気
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </div>

      <section className="mx-auto w-full max-w-[1320px] px-6 pb-16">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-3xl font-bold tracking-normal">最近のプロジェクト</h2>
          <Button type="text" className="text-white/45">
            すべて表示
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <button
            type="button"
            onClick={() => document.querySelector<HTMLTextAreaElement>('.flova-home-input')?.focus()}
            className="flex min-h-[180px] items-center justify-center rounded-3xl border border-dashed border-white/28 bg-white/[.025] text-white/60 transition hover:border-white/45 hover:bg-white/[.05]"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/35 text-4xl">
              +
            </span>
          </button>
          {projects.map((project) => (
            <Card
              key={project.id}
              loading={loadingProjects}
              onClick={() => navigate(`/projects/${project.id}`)}
              className="flova-project-card min-h-[180px] cursor-pointer overflow-hidden rounded-3xl border-white/10 bg-[#111]"
              bodyStyle={{ padding: 0 }}
            >
              <div className="h-[108px] bg-[radial-gradient(circle_at_28%_30%,rgba(255,255,255,.22),transparent_22%),linear-gradient(135deg,rgba(20,184,166,.35),rgba(37,99,235,.20),rgba(249,115,22,.18))]" />
              <div className="p-5">
                <div className="mb-2 flex items-center gap-2">
                  <Tag color="green" className="mr-0 border-0 bg-[#203c22] text-[#a7e68f]">
                    {project.progress}% analyze
                  </Tag>
                </div>
                <div className="truncate text-lg font-semibold text-white">{project.name}</div>
                <div className="mt-1 line-clamp-1 text-sm text-white/38">{project.description || 'Agent generated project'}</div>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  )
}

export default ProjectLobby
