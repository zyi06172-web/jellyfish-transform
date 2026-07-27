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
import {
  HOME_SKILL_CARDS,
  createHomePromptIdempotencyKey,
  toHomeProjectCard,
  type HomeProjectCard,
  type SkillMode,
} from './homeProjectCreation'

/** 女娲式首页：承接用户输入、创建项目，并把新项目即时放回最近项目。 */
const ProjectLobby: React.FC = () => {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<HomeProjectCard[]>([])
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState('默认创作模型')
  const [selectedSkill, setSelectedSkill] = useState<SkillMode>('short_drama')
  const [creating, setCreating] = useState(false)
  const [loadingProjects, setLoadingProjects] = useState(false)
  const canCreate = prompt.trim().length > 0 && !creating

  const selectedSkillInfo = useMemo(
    () => HOME_SKILL_CARDS.find((item) => item.key === selectedSkill) ?? HOME_SKILL_CARDS[2],
    [selectedSkill],
  )

  /** 读取最近项目，让首页底部始终可以恢复之前的创作上下文。 */
  const loadProjects = async () => {
    setLoadingProjects(true)
    try {
      const res = await StudioProjectsService.listProjectsApiV1StudioProjectsGet({
        page: 1,
        pageSize: 12,
      })
      setProjects((res.data?.items ?? []).map(toHomeProjectCard))
    } catch {
      setProjects([])
    } finally {
      setLoadingProjects(false)
    }
  }

  useEffect(() => {
    void loadProjects()
  }, [])

  /** 将首页输入转成项目创建请求，并在创建成功后进入对应项目工作台。 */
  const handleCreateFromPrompt = async () => {
    const content = prompt.trim()
    if (!content) {
      message.warning('先写一段剧情大纲或视频需求')
      return
    }
    setCreating(true)
    try {
      const res = await StudioProjectsService.createProjectFromPromptApiV1StudioProjectsFromPromptPost({
        requestBody: {
          prompt: content,
          skill_key: selectedSkillInfo.key,
          idempotency_key: createHomePromptIdempotencyKey(),
        },
      })
      const created = res.data
      if (!created) throw new Error('empty project')
      message.success('已创建项目，正在分析剧情…')
      setProjects((prev) => [
        {
          id: created.project_id,
          name: '正在分析剧情…',
          description: content,
          updatedAt: new Date().toLocaleString(),
          progress: 2,
        },
        ...prev,
      ])
      setPrompt('')
      navigate(`/projects/${created.project_id}`)
    } catch {
      message.error('项目创建失败，请检查后端服务')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="relative h-full overflow-y-auto bg-transparent text-white">
      <div className="nuwa-deep-space pointer-events-none fixed inset-0" />

      <section className="relative px-8 pb-7 pt-8">
        <div className="relative mx-auto flex max-w-[1120px] flex-col items-center">
          <div className="mb-8 flex w-full items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold text-white/50">智能视频创作助理</div>
              <div className="mt-1 text-base font-semibold">女娲 AI 影像工作台</div>
            </div>
            <div className="rounded-full border border-white/10 bg-white/[.08] px-4 py-2 text-xs font-semibold text-white/62 shadow-sm backdrop-blur-2xl">
              当前计划：免费版
            </div>
          </div>

          <h1 className="max-w-[960px] text-center text-5xl font-semibold leading-[1.03] tracking-normal text-white md:text-[76px]">
            <span className="block">从一句灵感</span>
            <span className="block">生成完整影像资产链</span>
          </h1>
          <p className="mt-5 max-w-[700px] text-center text-lg leading-relaxed text-white/54">
            把剧本交给女娲，它会沉淀角色圣经、资产库、故事板、镜头分组和视频提示词，让每一集都能沿着同一套视觉资产继续生长。
          </p>

          <div className="flova-prompt-shell mt-10 w-full max-w-[520px] rounded-[28px] p-[1px]">
            <div className="relative rounded-[27px] bg-[#f8fafc]/95 p-4 shadow-[0_22px_62px_rgba(0,0,0,.28)] backdrop-blur-2xl">
              <Input.TextArea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                disabled={creating}
                autoSize={{ minRows: 3, maxRows: 5 }}
                bordered={false}
                className="flova-home-input text-[17px]"
                placeholder="写下剧情大纲、广告创意或长视频想法。创作助理会总结标题并创建项目..."
                onPressEnter={(event) => {
                  if (!event.shiftKey && canCreate) {
                    event.preventDefault()
                    void handleCreateFromPrompt()
                  }
                }}
              />
              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                <Button shape="circle" icon={<PlusOutlined />} className="apple-circle-button" />
                <Select
                  value={model}
                  onChange={setModel}
                  className="apple-pill-select min-w-[138px]"
                  options={[
                    { value: '默认创作模型', label: '模型　默认' },
                    { value: 'Seed 2.0', label: 'Seed 2.0' },
                    { value: 'Veo', label: 'Veo' },
                  ]}
                />
                <Button className="apple-pill-button" icon={<GiftOutlined />} onClick={() => document.getElementById('nuwa-skill-cards')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
                  技能
                </Button>
                <Button className="apple-pill-button" icon={<VideoCameraOutlined />} onClick={() => navigate('/asset-library')}>
                  资产库
                </Button>
                <div className="ml-auto flex items-center gap-3">
                  <Button shape="circle" icon={<AudioOutlined />} className="apple-circle-button" />
                  <Button
                    shape="circle"
                    size="large"
                    loading={creating}
                    icon={<ArrowUpOutlined />}
                    disabled={!canCreate}
                    onClick={() => void handleCreateFromPrompt()}
                    className="border-none bg-[#1d1d1f] text-white shadow-lg shadow-black/20"
                  />
                </div>
              </div>
            </div>
          </div>

          <div id="nuwa-skill-cards" className="mt-7 grid w-full max-w-[920px] grid-cols-1 gap-3 md:grid-cols-3">
            {HOME_SKILL_CARDS.map((skill) => (
              <button
                key={skill.key}
                type="button"
                onClick={() => setSelectedSkill(skill.key)}
                className={`relative flex h-[72px] items-center gap-3 overflow-visible rounded-[22px] border px-4 text-left transition ${
                  selectedSkill === skill.key
                    ? 'border-white/18 bg-white text-[#111827] shadow-[0_22px_56px_rgba(34,211,238,.18)]'
                    : 'border-white/10 bg-white/[.075] text-white shadow-[0_10px_28px_rgba(0,0,0,.20)] hover:-translate-y-0.5 hover:bg-white/[.12] hover:shadow-[0_18px_42px_rgba(0,0,0,.24)]'
                }`}
                style={{ backgroundImage: selectedSkill === skill.key ? skill.accent : undefined }}
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg ${
                  selectedSkill === skill.key ? 'bg-black/[.06]' : 'bg-white/[.10]'
                }`}>
                  {skill.icon}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold">{skill.title}</div>
                  <div className={`truncate text-xs ${selectedSkill === skill.key ? 'text-black/46' : 'text-white/46'}`}>
                    {skill.subtitle}
                  </div>
                </div>
                {skill.hot ? (
                  <span className={`absolute -top-3 right-4 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    selectedSkill === skill.key ? 'bg-[#111827] text-white' : 'bg-white text-[#111827]'
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
          <Button type="text" className="text-sm text-white/50">
            查看全部
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <button
            type="button"
            onClick={() => document.querySelector<HTMLTextAreaElement>('.flova-home-input textarea')?.focus()}
            className="flex min-h-[168px] items-center justify-center rounded-[30px] border border-dashed border-white/18 bg-white/[.06] text-white/42 transition hover:border-white/28 hover:bg-white/[.10]"
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
            className="flova-project-card min-h-[168px] cursor-pointer overflow-hidden rounded-[30px] border-white/10 bg-white/[.92]"
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
                <div className="mt-1 line-clamp-1 text-xs text-black/42">{project.description || '创作助理创建的项目'}</div>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  )
}

export default ProjectLobby
