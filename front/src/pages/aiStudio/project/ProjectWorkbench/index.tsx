import React, { useMemo, useState } from 'react'
import { Button, Empty, Input, Progress, Tag } from 'antd'
import {
  AppstoreOutlined,
  ArrowLeftOutlined,
  ArrowUpOutlined,
  AudioOutlined,
  DownOutlined,
  EllipsisOutlined,
  PictureOutlined,
  PlusOutlined,
  ReloadOutlined,
  UpOutlined,
} from '@ant-design/icons'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useChapters, useProject } from './hooks/useProjectData'
import { getChapterStudioPath } from './routes'

type AgentStep = 'format' | 'characters' | 'audio' | 'animation'

const stepCopy: Record<AgentStep, { title: string; body: string; action: string; detail: string }> = {
  format: {
    title: '确认制作方向',
    body: '剧情已经完成初步分析。接下来先确认视频比例、时长和影像质感。',
    action: '竖屏 9:16 · 1 到 2 分钟 · 写实短剧风格',
    detail: '适合社交媒体和短剧平台，先按真人写实的影像质感推进。',
  },
  characters: {
    title: '生成角色画像和关键元素',
    body: '我会同时准备角色、场景、服装和道具，让关键元素可以直接进入分镜。',
    action: '继续生成角色画像',
    detail: '为主要角色、反派、医生和关键道具生成参考图，并登记到关键元素。',
  },
  audio: {
    title: '选择角色声音生成方式',
    body: '如果没有上传声音样本，可以先用低消耗旁白模型生成角色音频引用。',
    action: '用旁白模型生成角色音频',
    detail: '从每个角色脚本中抽取 3 到 5 秒台词，生成声音引用并登记。',
  },
  animation: {
    title: '开始生成动画草稿',
    body: '分镜、关键元素、音频引用已经排布完成。下一步可以生成动画草稿。',
    action: '使用当前分镜生成动画',
    detail: '不满意的角色或镜头可以在右侧随时提出，只局部重生成，不影响主进度。',
  },
}

const steps: AgentStep[] = ['format', 'characters', 'audio', 'animation']

/** 从项目描述中抽取用户原始剧情，隐藏首页写入的 Skill/Model 元信息。 */
function extractStory(description?: string | null) {
  const text = description ?? ''
  const parts = text.split(/\n\s*\n/)
  return (parts[1] ?? text).trim() || '用户还没有写入剧情大纲，Agent 会先等待新的创作指令。'
}

/** 生成三栏工作台里展示用的关键元素，第一版先基于短剧常见结构模拟。 */
function buildKeyElements(story: string) {
  const isDrama = /婚|总裁|复仇|妹妹|医生|孩子|离婚|豪门|女主|男主/.test(story)
  if (isDrama) {
    return [
      { name: '女主角 · 苏眠', kind: '图片', tone: 'from-[#f7d7d7] to-[#f5f5f7]', desc: '白裙、受伤妆、压抑但倔强' },
      { name: '男主角 · 傅寒舟', kind: '图片', tone: 'from-[#dbeafe] to-[#f5f5f7]', desc: '高级黑西装、冷峻表情' },
      { name: '反派妹妹 · 苏婉', kind: '图片', tone: 'from-[#ede9fe] to-[#f5f5f7]', desc: '礼服、虚伪笑容、反派气质' },
      { name: '医生', kind: '图片', tone: 'from-[#ccfbf1] to-[#f5f5f7]', desc: '白衣、眼镜、专业表情' },
    ]
  }
  return [
    { name: '主人公', kind: '图片', tone: 'from-[#f7d7d7] to-[#f5f5f7]', desc: '核心角色参考图' },
    { name: '对手角色', kind: '图片', tone: 'from-[#dbeafe] to-[#f5f5f7]', desc: '冲突人物参考图' },
    { name: '主场景', kind: '图片', tone: 'from-[#ede9fe] to-[#f5f5f7]', desc: '主要空间与氛围' },
    { name: '关键道具', kind: '图片', tone: 'from-[#ccfbf1] to-[#f5f5f7]', desc: '推动剧情的道具' },
  ]
}

const ProjectWorkbench: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { project, loading: projectLoading } = useProject(projectId)
  const { chapters } = useChapters(projectId)
  const [activeStep, setActiveStep] = useState<AgentStep>('format')
  const [messageText, setMessageText] = useState('')
  const [agentNotes, setAgentNotes] = useState<string[]>([])

  const story = useMemo(() => extractStory(project?.description), [project?.description])
  const keyElements = useMemo(() => buildKeyElements(story), [story])
  const activeStepIndex = steps.indexOf(activeStep)
  const activeStepCopy = stepCopy[activeStep]

  const advanceStep = () => {
    const next = steps[Math.min(activeStepIndex + 1, steps.length - 1)]
    setAgentNotes((prev) => [...prev, activeStepCopy.action])
    setActiveStep(next)
  }

  const submitFreeMessage = () => {
    const text = messageText.trim()
    if (!text) return
    setAgentNotes((prev) => [
      ...prev,
      `用户反馈：${text}`,
      text.includes('女主') || text.includes('不好看')
        ? 'Agent：我会只重生成女主角参考图，并保持场景、音频和分镜进度不变。'
        : 'Agent：收到，我会把这个偏好写入当前项目记忆，并在后续生成中保持一致。',
    ])
    setMessageText('')
  }

  if (!project && !projectLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#f5f5f7] text-[#1d1d1f]">
        <div className="text-center">
          <Empty description={<span className="text-black/50">项目不存在</span>} />
          <Link to="/projects">
            <Button icon={<ArrowLeftOutlined />}>
              返回主页
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[320px_minmax(360px,1fr)_520px] gap-4 overflow-hidden bg-[#f5f5f7] p-4 text-[#1d1d1f]">
      <aside className="flex min-h-0 flex-col overflow-hidden rounded-[32px] border border-black/5 bg-white/72 shadow-sm backdrop-blur-2xl">
        <div className="flex h-16 items-center justify-between border-b border-black/5 px-5">
          <div className="flex items-center gap-3 text-xl font-semibold">
            <DownOutlined className="text-xs text-black/35" />
            故事板
          </div>
          <EllipsisOutlined className="text-xl text-black/40" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <section className="border-b border-black/5 p-5">
            <div className="mb-4 flex items-center gap-3 text-xl font-semibold">
              <DownOutlined className="text-xs text-black/35" />
              关键元素
            </div>
            <div className="space-y-5">
              {keyElements.map((element) => (
                <div key={element.name}>
                  <div className="mb-3 flex items-center gap-2 text-base font-semibold text-black/58">
                    <DownOutlined className="text-xs" />
                    {element.name}
                  </div>
                  <div className="ml-8 flex items-end gap-2">
                    <div className="flex h-[72px] w-[126px] items-center rounded-[22px] bg-black/[.045] px-4 text-sm text-black/42">
                      <AudioOutlined className="mr-2" /> 音频引用
                    </div>
                    <div className={`h-[96px] w-[68px] rounded-[22px] bg-gradient-to-br ${element.tone} shadow-inner`} />
                    <button className="h-9 w-9 rounded-2xl border border-dashed border-black/18 text-xl text-black/38">+</button>
                  </div>
                  <div className="ml-8 mt-2 flex gap-2">
                    <Tag className="mr-0 rounded-full border-0 bg-black/[.06] text-black/54">
                      {element.kind}
                    </Tag>
                    <span className="truncate text-xs text-black/38">{element.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3 text-xl font-semibold">
                <DownOutlined className="text-xs text-black/35" />
                未分类素材
              </div>
              <span className="text-sm text-black/35">全部</span>
            </div>
            <div className="flex h-[220px] flex-col items-center justify-center rounded-[26px] border border-black/5 bg-black/[.025] text-center text-black/28">
              <PlusOutlined className="mb-4 text-2xl" />
              尚未放入故事板的生成素材会显示在这里。
            </div>
          </section>
        </div>
        <div className="flex h-16 items-center justify-center gap-4 border-t border-black/5">
          <Button shape="round">−</Button>
          <span className="font-semibold text-black/55">70%</span>
          <Button shape="round">+</Button>
        </div>
      </aside>

      <main className="flex min-h-0 flex-col overflow-hidden rounded-[32px] border border-black/5 bg-white/72 shadow-sm backdrop-blur-2xl">
        <div className="flex h-16 items-center justify-between border-b border-black/5 px-5">
          <div className="min-w-0 text-xl font-semibold">
            预览 <span className="text-base font-normal text-black/28">女主角参考图</span>
          </div>
          <div className="flex gap-2">
            <Tag className="rounded-full border-0 bg-black/[.06] px-4 py-1 text-black/48">默认模型</Tag>
            <Tag className="rounded-full border-0 bg-black/[.06] px-4 py-1 text-black/48">1K 预览</Tag>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-[520px] rounded-[34px] bg-[#f5f5f7] p-4 shadow-inner">
            <div className="relative aspect-[9/16] overflow-hidden rounded-[28px] bg-[radial-gradient(circle_at_32%_36%,rgba(255,255,255,.82),transparent_18%),linear-gradient(140deg,#dbeafe,#e5e7eb_42%,#fdf2f8)]">
              <div className="absolute left-0 top-0 h-full w-[49%] border-r border-white/70 bg-[radial-gradient(circle_at_52%_27%,rgba(255,230,214,.84),transparent_18%),linear-gradient(180deg,rgba(148,163,184,.30),rgba(255,255,255,.38))]" />
              <div className="absolute right-[10%] top-[16%] h-[72%] w-[28%] rounded-t-full bg-[linear-gradient(180deg,rgba(255,255,255,.94),rgba(226,232,240,.68))]" />
              <div className="absolute bottom-8 left-6 max-w-[240px] rounded-[22px] bg-white/62 p-4 shadow-lg backdrop-blur-2xl">
                <div className="text-sm text-black/38">剧情总结</div>
                <div className="mt-2 line-clamp-6 text-lg leading-relaxed text-[#1d1d1f]">
                  {story}
                </div>
              </div>
              <button className="absolute left-5 top-[44%] flex h-14 w-14 items-center justify-center rounded-full bg-white/58 text-black/54 shadow backdrop-blur">
                <UpOutlined />
              </button>
              <button className="absolute bottom-[35%] left-5 flex h-14 w-14 items-center justify-center rounded-full bg-white/58 text-black/54 shadow backdrop-blur">
                <DownOutlined />
              </button>
            </div>
          </div>
        </div>
        <div className="flex h-16 items-center justify-center gap-4 border-t border-black/5 px-5">
          <Button shape="round" icon={<AudioOutlined />}>提示词</Button>
          <Button shape="round" icon={<ReloadOutlined />}>重新生成</Button>
          {chapters[0] && projectId ? (
            <Button type="primary" shape="round" onClick={() => navigate(getChapterStudioPath(projectId, chapters[0].id))}>
              真实分镜工作室
            </Button>
          ) : null}
        </div>
      </main>

      <aside className="flex min-h-0 flex-col overflow-hidden rounded-[32px] border border-black/5 bg-white/72 shadow-sm backdrop-blur-2xl">
        <div className="flex h-16 items-center justify-between border-b border-black/5 px-6">
          <div className="text-xl font-semibold">Agent 对话</div>
          <Button shape="circle" type="text" className="text-black/38">×</Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
          <div className="mb-6 space-y-3 text-lg leading-relaxed text-black/62">
            <div>• 已生成项目标题：{project?.name ?? '新项目'}</div>
            <div>• 剧情总结已写入项目记忆</div>
            <div>• 关键元素初稿已准备</div>
          </div>
          <div className="my-8 h-px bg-black/6" />
          <div className="text-lg leading-relaxed text-black/62">
            <p>{activeStepCopy.body}</p>
            <p className="mt-4 font-semibold text-[#1d1d1f]">{activeStepCopy.title}</p>
          </div>
          <button
            type="button"
            onClick={advanceStep}
            className="mt-8 w-full rounded-[30px] border border-black/5 bg-[#1d1d1f] p-7 text-left text-lg leading-relaxed text-white shadow-[0_24px_70px_rgba(0,0,0,.18)] transition hover:-translate-y-0.5 hover:shadow-[0_30px_90px_rgba(0,0,0,.22)]"
          >
            <div className="font-semibold">{activeStepCopy.action}</div>
            <div className="mt-2 text-white/70">{activeStepCopy.detail}</div>
            <div className="mt-5 flex justify-end">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/14">
                <ArrowUpOutlined />
              </span>
            </div>
          </button>
          {agentNotes.length ? (
            <div className="mt-8 space-y-3">
              {agentNotes.map((note, index) => (
                <div key={`${note}-${index}`} className="rounded-2xl bg-black/[.045] px-4 py-3 text-sm text-black/58">
                  {note}
                </div>
              ))}
            </div>
          ) : null}
          <div className="mt-8">
            <div className="mb-3 flex items-center gap-3">
              {steps.map((step, index) => (
                <div
                  key={step}
                  className={`h-2 flex-1 rounded-full ${index <= activeStepIndex ? 'bg-[#1d1d1f]' : 'bg-black/8'}`}
                />
              ))}
            </div>
            <Progress
              percent={Math.round(((activeStepIndex + 1) / steps.length) * 100)}
              showInfo={false}
              strokeColor="#1d1d1f"
              trailColor="rgba(0,0,0,.06)"
            />
          </div>
        </div>
        <div className="border-t border-black/5 p-4">
          <div className="rounded-[28px] border border-black/5 bg-white p-3 shadow-sm">
            <Input.TextArea
              value={messageText}
              onChange={(event) => setMessageText(event.target.value)}
              autoSize={{ minRows: 2, maxRows: 4 }}
              bordered={false}
              className="flova-chat-input"
              placeholder="输入你的修改意见，例如：女主不够好看，重新生成一个..."
              onPressEnter={(event) => {
                if (event.metaKey || event.ctrlKey) submitFreeMessage()
              }}
            />
            <div className="mt-3 flex items-center gap-3">
              <Button shape="circle" icon={<PlusOutlined />} />
              <Button shape="circle" icon={<AppstoreOutlined />} />
              <Button shape="circle" icon={<PictureOutlined />} />
              <Button shape="circle" icon={<AudioOutlined />} className="ml-auto" />
              <Button shape="circle" icon={<ArrowUpOutlined />} onClick={submitFreeMessage} />
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}

export default ProjectWorkbench
