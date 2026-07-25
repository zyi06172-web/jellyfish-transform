import React, { useMemo, useState } from 'react'
import { Button, Empty, Input, Progress, Tag } from 'antd'
import {
  AppstoreOutlined,
  ArrowLeftOutlined,
  ArrowUpOutlined,
  AudioOutlined,
  CheckOutlined,
  DownOutlined,
  EllipsisOutlined,
  FileTextOutlined,
  PictureOutlined,
  PlusOutlined,
  ReloadOutlined,
  UpOutlined,
} from '@ant-design/icons'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useChapters, useProject } from './hooks/useProjectData'
import { getChapterStudioPath } from './routes'

type AgentStep = 'script' | 'spec' | 'storyboard' | 'elements' | 'audio' | 'shots' | 'mix' | 'export'
type WorkflowOptionEffect = 'confirm_and_advance' | 'stay_and_collect_feedback'
type WorkflowOption = {
  id: string
  effect: WorkflowOptionEffect
  label: string
  description: string
}
type WorkflowStep = {
  key: AgentStep
  title: string
  body: string
  action: string
  detail: string
  dependency: string
  output: string
  options: WorkflowOption[]
}
type AgentNote = {
  role: 'user' | 'assistant'
  text: string
}
type KeyElement = {
  name: string
  kind: string
  tone: string
  desc: string
  audio: string
}

const workspacePanelClass =
  'flex min-h-0 flex-col overflow-hidden rounded-[32px] border border-black/5 bg-white/72 shadow-sm backdrop-blur-2xl'

const stepCopy: Record<AgentStep, WorkflowStep> = {
  script: {
    key: 'script',
    title: '确认剧情与脚本',
    body: '我会先读取首页输入的剧情，整理一句话总结、人物、场景和关键动作。确认前不会进入规格和故事板。',
    action: '确认剧情，继续制作',
    detail: '剧情结构、核心冲突和主要角色已可用于下一步。',
    dependency: '输入剧情或上传脚本',
    output: '剧情总结、人物列表、场景线索',
    options: [
      { id: 'confirm-script', effect: 'confirm_and_advance', label: '确认剧情，继续制作', description: '沿用当前剧情作为唯一依据，进入视频规格确认。' },
      { id: 'revise-script', effect: 'stay_and_collect_feedback', label: '需要先改剧情', description: '暂停后续步骤，把修改意见写进右下角对话框。' },
    ],
  },
  spec: {
    key: 'spec',
    title: '确认成片规格',
    body: '按照流程计划，我需要先固定标题、类型、比例、时长、视觉风格、语言和模型偏好，再设计故事板。',
    action: '竖屏 9:16 · 1 到 2 分钟 · 写实短剧风格',
    detail: '适合短剧平台和社交媒体，先按中文写实短剧推进。',
    dependency: '剧情确认',
    output: '成片规格文档草稿',
    options: [
      { id: 'confirm-vertical-short-drama', effect: 'confirm_and_advance', label: '竖屏 9:16 · 1 到 2 分钟 · 写实短剧', description: '短剧默认方案，优先角色表演和反转节奏。' },
      { id: 'revise-spec-horizontal-film', effect: 'stay_and_collect_feedback', label: '横屏 16:9 · 3 分钟以上 · 电影质感', description: '更适合长视频、广告片或品牌故事。' },
    ],
  },
  storyboard: {
    key: 'storyboard',
    title: '生成故事板',
    body: '我会严格沿用已确认剧情，不改台词和事实，只拆分关键元素、镜头、台词和音频层。',
    action: '生成故事板和镜头列表',
    detail: '镜头会控制在 15 秒以内，并包含场景、动作、对白和摄影机描述。',
    dependency: '成片规格确认',
    output: '关键元素、镜头列表、音频层',
    options: [
      { id: 'confirm-storyboard', effect: 'confirm_and_advance', label: '生成故事板', description: '进入左侧故事板，准备关键元素和镜头资产。' },
      { id: 'review-spec-summary', effect: 'stay_and_collect_feedback', label: '先看规格摘要', description: '暂停生成，先核对标题、比例、时长和风格。' },
    ],
  },
  elements: {
    key: 'elements',
    title: '准备关键元素',
    body: '接下来会生成或绑定角色、场景、服装和道具。已有素材不重复生成，直接登记到对应关键元素。',
    action: '生成角色画像和关键元素',
    detail: '角色图采用左脸部特写、右全身参考，保证后续镜头一致性。',
    dependency: '故事板完成',
    output: 'key_elements 与参考图',
    options: [
      { id: 'confirm-generate-elements', effect: 'confirm_and_advance', label: '生成角色画像', description: '为主要角色、场景、服装和道具生成参考图。' },
      { id: 'provide-reference-assets', effect: 'stay_and_collect_feedback', label: '我已有参考素材', description: '保留进度，等待上传或绑定已有资产。' },
    ],
  },
  audio: {
    key: 'audio',
    title: '选择角色声音生成方式',
    body: '每个有台词的角色都需要音色锚点。没有声音样本时，可以选低消耗旁白模型，也可以用 Seedance 视频抽音频。',
    action: '用旁白模型生成角色音频',
    detail: '从每个角色脚本中抽取 3 到 5 秒台词，生成音色引用并登记。',
    dependency: '关键元素准备完成',
    output: 'key_element_audio',
    options: [
      { id: 'confirm-narration-voice-anchor', effect: 'confirm_and_advance', label: '旁白模型生成音色', description: '消耗较少，适合先快速推进角色音频引用。' },
      { id: 'revise-voice-anchor-path', effect: 'stay_and_collect_feedback', label: 'Seedance 视频抽取音色', description: '消耗较多，但能保留角色说话状态的视频资产。' },
    ],
  },
  shots: {
    key: 'shots',
    title: '开始生成动画草稿',
    body: '镜头视频会引用角色图、场景图、道具图和对应角色音频，保证跨镜头视觉与音色一致。',
    action: '使用当前分镜生成动画',
    detail: '不满意的角色或镜头可以随时提出，只局部重生成，不打断主流程。',
    dependency: '关键元素与音色完成',
    output: '分镜视频草稿',
    options: [
      { id: 'confirm-generate-shot-video', effect: 'confirm_and_advance', label: '生成当前镜头视频', description: '先生成首批镜头草稿，检查角色一致性。' },
      { id: 'prepare-keyframes-first', effect: 'stay_and_collect_feedback', label: '先补关键帧', description: '先为每个镜头准备起始帧、结束帧和高潮帧。' },
    ],
  },
  mix: {
    key: 'mix',
    title: '生成音频层',
    body: '根据故事板生成背景音乐、旁白或对白层，并保持和时间线顺序一致。',
    action: '生成背景音乐和音频层',
    detail: '视频提示词会默认避免模型自行添加音乐和字幕，后期统一合成。',
    dependency: '镜头视频完成',
    output: 'BGM、对白、旁白层',
    options: [
      { id: 'confirm-generate-audio-layers', effect: 'confirm_and_advance', label: '生成音频层', description: '为当前故事板准备 BGM、对白和旁白。' },
      { id: 'silent-preview-first', effect: 'stay_and_collect_feedback', label: '暂时静音预览', description: '先看画面节奏，音频稍后生成。' },
    ],
  },
  export: {
    key: 'export',
    title: '进入最终剪辑',
    body: '所有资源准备后，会按故事板顺序组装镜头、音频和字幕，然后进入导出。',
    action: '进入导出前检查',
    detail: '检查缺失素材、音频绑定和镜头顺序，再进入最终合成。',
    dependency: '视频与音频层完成',
    output: '可导出的成片时间线',
    options: [
      { id: 'confirm-export-check', effect: 'confirm_and_advance', label: '检查并导出', description: '汇总缺失项，准备最终剪辑与导出。' },
      { id: 'continue-local-revisions', effect: 'stay_and_collect_feedback', label: '继续局部修改', description: '留在工作台，针对角色、镜头或音频继续调整。' },
    ],
  },
}

const steps: AgentStep[] = ['script', 'spec', 'storyboard', 'elements', 'audio', 'shots', 'mix', 'export']

/** 从项目描述中抽取用户原始剧情，隐藏首页写入的技能和模型元信息。 */
function extractStory(description?: string | null) {
  const text = description ?? ''
  const parts = text.split(/\n\s*\n/)
  return (parts[1] ?? text).trim() || '用户还没有写入剧情大纲，创作助理会先等待新的创作指令。'
}

/** 生成三栏工作台里展示用的关键元素，未接生成接口前先从剧情关键词推断角色组。 */
function buildKeyElements(story: string): KeyElement[] {
  const isDrama = /婚|总裁|复仇|妹妹|医生|孩子|离婚|豪门|女主|男主/.test(story)
  if (isDrama) {
    return [
      { name: '主人公', kind: '图片', tone: 'from-[#f7d7d7] to-[#f5f5f7]', desc: '核心角色参考图', audio: '女主音色锚点' },
      { name: '对手角色', kind: '图片', tone: 'from-[#dbeafe] to-[#f5f5f7]', desc: '冲突人物参考图', audio: '男主/反派音色锚点' },
      { name: '配角', kind: '图片', tone: 'from-[#ede9fe] to-[#f5f5f7]', desc: '医生、亲属或证人参考图', audio: '配角音色锚点' },
      { name: '主场景', kind: '图片', tone: 'from-[#ccfbf1] to-[#f5f5f7]', desc: '主要空间与氛围', audio: '环境声锚点' },
    ]
  }
  return [
    { name: '主人公', kind: '图片', tone: 'from-[#f7d7d7] to-[#f5f5f7]', desc: '核心角色参考图', audio: '主角音色锚点' },
    { name: '对手角色', kind: '图片', tone: 'from-[#dbeafe] to-[#f5f5f7]', desc: '冲突人物参考图', audio: '对手音色锚点' },
    { name: '主场景', kind: '图片', tone: 'from-[#ede9fe] to-[#f5f5f7]', desc: '主要空间与氛围', audio: '环境声锚点' },
    { name: '关键道具', kind: '图片', tone: 'from-[#ccfbf1] to-[#f5f5f7]', desc: '推动剧情的道具', audio: '道具音效锚点' },
  ]
}

/** 依据当前阶段给左侧故事板生成可扫描的生产状态。 */
function buildStoryboardRows(activeStepIndex: number) {
  return steps.map((step, index) => {
    const item = stepCopy[step]
    const status = index < activeStepIndex ? '已确认' : index === activeStepIndex ? '等待确认' : '未开始'
    return { ...item, status }
  })
}

/** 根据问题卡选项语义决定是否推进阶段，避免修改类选项误触发下一步。 */
function resolveOptionTransition(activeStepIndex: number, option: WorkflowOption) {
  if (option.effect === 'stay_and_collect_feedback') {
    return {
      nextStep: steps[activeStepIndex],
      assistantText: `已记录：${option.description}。我会停在当前阶段，等待你在对话框补充修改意见。`,
    }
  }
  const nextStep = steps[Math.min(activeStepIndex + 1, steps.length - 1)]
  return {
    nextStep,
    assistantText: `已记录：${option.description}。下一步进入「${stepCopy[nextStep].title}」。`,
  }
}

/** 根据剧情给助理生成第一段回应，让工作台不像只会机械推进的按钮流。 */
function buildAgentOpening(story: string) {
  const compactStory = story.replace(/\s+/g, ' ').trim()
  const hook =
    compactStory.length > 36 ? `${compactStory.slice(0, 36)}...` : compactStory || '新的短剧创意'
  const genre = /总裁|豪门|离婚|婚|复仇/.test(story)
    ? '都市情感短剧'
    : /广告|产品|品牌/.test(story)
      ? '商业视频'
      : '视频故事'
  const conflict = /霸总|总裁/.test(story)
    ? '权力关系和情感反差'
    : /复仇|背叛|离婚/.test(story)
      ? '背叛后的反击与身份翻转'
      : '人物目标与阻碍之间的冲突'
  return {
    hook,
    genre,
    conflict,
    summary: `我先把它理解成「${genre}」：${hook}。核心看点是${conflict}。我不会马上生成素材，会先按脚本、规格、故事板和关键元素逐步确认。`,
  }
}

/** 三栏项目工作台：把故事板、预览和互动式创作助理放在同一制作画布中。 */
const ProjectWorkbench: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { project, loading: projectLoading } = useProject(projectId)
  const { chapters } = useChapters(projectId)
  const [activeStep, setActiveStep] = useState<AgentStep>('script')
  const [messageText, setMessageText] = useState('')
  const [agentNotes, setAgentNotes] = useState<AgentNote[]>([])

  const story = useMemo(() => extractStory(project?.description), [project?.description])
  const keyElements = useMemo(() => buildKeyElements(story), [story])
  const activeStepIndex = steps.indexOf(activeStep)
  const activeStepCopy = stepCopy[activeStep]
  const storyboardRows = useMemo(() => buildStoryboardRows(activeStepIndex), [activeStepIndex])
  const agentOpening = useMemo(() => buildAgentOpening(story), [story])
  const showFlowIntro = activeStepIndex < 4

  /** 执行右侧问题卡选项，仅确认类选项会推进流程。 */
  const handleWorkflowOption = (option: WorkflowOption) => {
    const transition = resolveOptionTransition(activeStepIndex, option)
    setAgentNotes((prev) => [
      ...prev,
      { role: 'user', text: option.label },
      {
        role: 'assistant',
        text: transition.assistantText,
      },
    ])
    setActiveStep(transition.nextStep)
  }

  /** 记录用户自由反馈，局部调整偏好先写入当前工作台的临时对话记录。 */
  const submitUserFeedback = () => {
    const text = messageText.trim()
    if (!text) return
    setAgentNotes((prev) => [
      ...prev,
      { role: 'user', text },
      {
        role: 'assistant',
        text:
          text.includes('女主') || text.includes('不好看')
            ? '我会只重生成女主角参考图，并保持场景、音频和分镜进度不变。'
            : '收到，已记录在当前对话里，后续生成时我会参考这个偏好。',
      },
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
    <div className="grid h-full min-h-0 grid-cols-[minmax(300px,0.8fr)_minmax(360px,1fr)_minmax(520px,1.55fr)] gap-3 overflow-hidden bg-[#f6f7f9] p-3 text-[#1d1d1f]">
      <aside className={workspacePanelClass}>
        <div className="flex h-16 items-center justify-between border-b border-black/5 px-5">
          <div className="flex items-center gap-3 text-xl font-semibold">
            <DownOutlined className="text-xs text-black/35" />
            视频微调
          </div>
          <EllipsisOutlined className="text-xl text-black/40" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {showFlowIntro ? (
            <section className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-sm font-semibold text-black/42">流程介绍</div>
                <Tag className="mr-0 rounded-full border-0 bg-black/[.06] text-black/50">
                  {Math.round(((activeStepIndex + 1) / steps.length) * 100)}%
                </Tag>
              </div>
              <div className="mb-5 rounded-[26px] border border-dashed border-black/8 bg-white/52 p-5 text-sm leading-relaxed text-black/42">
                这里后面会变成角色图、音色锚点、场景和道具的微调区。前四轮先只展示流程，让用户跟着助理确认剧情、规格和故事板。
              </div>
              <div className="space-y-2">
                {storyboardRows.slice(0, 4).map((row, index) => (
                  <button
                    key={row.key}
                    type="button"
                    onClick={() => setActiveStep(row.key)}
                    className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                      row.key === activeStep
                        ? 'border-black/10 bg-[#1d1d1f] text-white'
                        : 'border-black/5 bg-white/70 text-[#1d1d1f] hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold">{index + 1}. {row.title}</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${
                        row.key === activeStep ? 'bg-white/14 text-white/72' : 'bg-black/[.045] text-black/38'
                      }`}>
                        {row.status}
                      </span>
                    </div>
                    <div className={`mt-1 line-clamp-1 text-xs ${row.key === activeStep ? 'text-white/58' : 'text-black/36'}`}>
                      依赖：{row.dependency}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <>
              <section className="border-b border-black/5 p-5">
                <div className="mb-4 flex items-center gap-3 text-xl font-semibold">
                  <DownOutlined className="text-xs text-black/35" />
                  关键元素
                </div>
                <div className="space-y-8">
                  {keyElements.slice(0, 3).map((element) => (
                    <div key={element.name}>
                      <div className="mb-4 flex items-center gap-2 text-xl font-semibold text-black/78">
                        <DownOutlined className="text-sm" />
                        {element.name}
                      </div>
                      <div className="ml-8 flex items-center gap-3">
                        <div className="flex h-[74px] min-w-[126px] items-center justify-center rounded-[24px] bg-black/[.055] px-4 text-sm font-semibold text-black/60">
                          <AudioOutlined className="mr-2 text-lg" /> {element.audio}
                        </div>
                        <div className={`h-[104px] w-[74px] rounded-[24px] bg-gradient-to-br ${element.tone} shadow-inner`} />
                        <button className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-black/20 text-2xl text-black">+</button>
                      </div>
                      <div className="ml-8 mt-3 flex gap-2">
                        <Tag className="mr-0 rounded-full border-0 bg-black/[.06] text-black/54">
                          {element.kind}
                        </Tag>
                        <span className="truncate text-sm text-black/58">{element.desc}</span>
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
                <div className="flex h-[180px] flex-col items-center justify-center rounded-[26px] border border-black/5 bg-black/[.025] text-center text-black/28">
                  <PlusOutlined className="mb-4 text-2xl" />
                  还没放入故事板的生成素材会显示在这里。
                </div>
              </section>
            </>
          )}
        </div>
        <div className="flex h-16 items-center justify-center gap-4 border-t border-black/5 px-5">
          <Progress
            percent={Math.round(((activeStepIndex + 1) / steps.length) * 100)}
            showInfo={false}
            strokeColor="#1d1d1f"
            trailColor="rgba(0,0,0,.06)"
          />
        </div>
      </aside>

      <main className={workspacePanelClass}>
        <div className="flex h-16 items-center justify-between border-b border-black/5 px-5">
          <div className="min-w-0 text-xl font-semibold">
            预览 <span className="text-base font-normal text-black/28">{activeStepCopy.output}</span>
          </div>
          <div className="flex gap-2">
            <Tag className="rounded-full border-0 bg-black/[.06] px-4 py-1 text-black/48">流程预览</Tag>
            <Tag className="rounded-full border-0 bg-black/[.06] px-4 py-1 text-black/48">不消耗额度</Tag>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="mx-auto flex w-full max-w-[620px] flex-col gap-4">
            <div className="rounded-[28px] border border-black/5 bg-white/74 p-5 shadow-sm">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-black/42">
                <FileTextOutlined /> 当前阶段
              </div>
              <div className="text-2xl font-semibold">{activeStepCopy.title}</div>
              <p className="mt-3 text-sm leading-relaxed text-black/48">{activeStepCopy.body}</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-black/[.035] p-3">
                  <div className="text-xs text-black/35">依赖</div>
                  <div className="mt-1 text-sm font-semibold text-black/60">{activeStepCopy.dependency}</div>
                </div>
                <div className="rounded-2xl bg-black/[.035] p-3">
                  <div className="text-xs text-black/35">输出</div>
                  <div className="mt-1 text-sm font-semibold text-black/60">{activeStepCopy.output}</div>
                </div>
              </div>
            </div>
            <div className="mx-auto w-full max-w-[430px] rounded-[34px] bg-[#f5f5f7] p-4 shadow-inner">
              <div className="relative aspect-[9/16] overflow-hidden rounded-[28px] bg-[radial-gradient(circle_at_32%_36%,rgba(255,255,255,.82),transparent_18%),linear-gradient(140deg,#dbeafe,#e5e7eb_42%,#fdf2f8)]">
                <div className="absolute left-0 top-0 h-full w-[49%] border-r border-white/70 bg-[radial-gradient(circle_at_52%_27%,rgba(255,230,214,.84),transparent_18%),linear-gradient(180deg,rgba(148,163,184,.30),rgba(255,255,255,.38))]" />
                <div className="absolute right-[10%] top-[16%] h-[72%] w-[28%] rounded-t-full bg-[linear-gradient(180deg,rgba(255,255,255,.94),rgba(226,232,240,.68))]" />
                <div className="absolute bottom-8 left-6 right-6 rounded-[22px] bg-white/70 p-4 shadow-lg backdrop-blur-2xl">
                  <div className="text-sm text-black/38">剧情总结</div>
                  <div className="mt-2 line-clamp-5 text-lg leading-relaxed text-[#1d1d1f]">
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
            <div className="grid grid-cols-3 gap-3">
              {['脚本', '元素', '音频'].map((label, index) => (
                <div key={label} className="rounded-[22px] border border-black/5 bg-white/66 p-3 shadow-sm">
                  <div className={`mb-3 h-16 rounded-[18px] bg-gradient-to-br ${
                    index === 0 ? 'from-[#fff7ed] to-[#e0f2fe]' : index === 1 ? 'from-[#fce7f3] to-[#eef2ff]' : 'from-[#ecfeff] to-[#f7fee7]'
                  }`} />
                  <div className="text-sm font-semibold">{label}</div>
                  <div className="mt-1 text-xs text-black/38">
                    {index <= Math.min(activeStepIndex, 2) ? '已进入流程' : '等待确认'}
                  </div>
                </div>
              ))}
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

      <aside className={workspacePanelClass}>
        <div className="flex h-16 items-center justify-between border-b border-black/5 px-6">
          <div className="text-xl font-semibold">助理对话</div>
          <Button shape="circle" type="text" className="text-black/38">×</Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
          <div className="mb-6 space-y-3 text-base leading-relaxed text-black/62">
            <div className="flex items-start gap-3">
              <CheckOutlined className="mt-1 text-black/35" />
              <span>已生成项目标题：{project?.name ?? '新项目'}</span>
            </div>
            <div className="flex items-start gap-3">
              <CheckOutlined className="mt-1 text-black/35" />
              <span>已读取首页剧情输入</span>
            </div>
            <div className="flex items-start gap-3">
              <CheckOutlined className="mt-1 text-black/35" />
              <span>后续每个关键阶段都会暂停确认</span>
            </div>
          </div>
          <div className="mb-6 rounded-[28px] border border-black/5 bg-black/[.035] p-5 text-base leading-relaxed text-black/62">
            <div className="mb-2 text-xs font-semibold text-black/36">助理理解</div>
            <p>{agentOpening.summary}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Tag className="mr-0 rounded-full border-0 bg-white/76 px-3 text-black/52">
                {agentOpening.genre}
              </Tag>
              <Tag className="mr-0 rounded-full border-0 bg-white/76 px-3 text-black/52">
                {agentOpening.conflict}
              </Tag>
            </div>
          </div>
          <div className="my-8 h-px bg-black/6" />
          <div className="text-base leading-relaxed text-black/62">
            <div className="mb-3 rounded-full bg-black/[.045] px-3 py-1 text-xs font-semibold text-black/42">
              来自视频制作流程 Skill · 第 {activeStepIndex + 1} 步 / {steps.length} 步
            </div>
            <p>{activeStepCopy.body}</p>
            <p className="mt-4 text-xl font-semibold text-[#1d1d1f]">{activeStepCopy.title}</p>
          </div>
          <div className="mt-7 space-y-3">
            {activeStepCopy.options.map((option, index) => (
              <button
                key={option.id}
                type="button"
                onClick={() => handleWorkflowOption(option)}
                className={`w-full rounded-[28px] border p-5 text-left leading-relaxed transition hover:-translate-y-0.5 ${
                  index === 0
                    ? 'border-black/5 bg-[#1d1d1f] text-white shadow-[0_24px_70px_rgba(0,0,0,.18)] hover:shadow-[0_30px_90px_rgba(0,0,0,.22)]'
                    : 'border-black/6 bg-white/74 text-[#1d1d1f] shadow-sm hover:bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-semibold">{option.label}</div>
                    <div className={`mt-2 text-sm ${index === 0 ? 'text-white/68' : 'text-black/42'}`}>
                      {option.description}
                    </div>
                  </div>
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    index === 0 ? 'bg-white/14' : 'bg-black/[.045]'
                  }`}>
                    <ArrowUpOutlined />
                  </span>
                </div>
              </button>
            ))}
            <div className="rounded-[24px] border border-black/5 bg-black/[.025] p-4 text-sm leading-relaxed text-black/42">
              当前阶段输出：{activeStepCopy.output}。依赖满足后才会进入下一步。
            </div>
          </div>
          {agentNotes.length ? (
            <div className="mt-8 space-y-3">
              {agentNotes.map((note, index) => (
                <div
                  key={`${note.role}-${note.text}-${index}`}
                  className={`rounded-2xl px-4 py-3 text-sm ${
                    note.role === 'user'
                      ? 'ml-10 bg-[#1d1d1f] text-white'
                      : 'mr-10 bg-black/[.045] text-black/58'
                  }`}
                >
                  {note.text}
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
                if (!event.shiftKey) {
                  event.preventDefault()
                  submitUserFeedback()
                }
              }}
            />
            <div className="mt-3 flex items-center gap-3">
              <Button shape="circle" icon={<PlusOutlined />} />
              <Button shape="circle" icon={<AppstoreOutlined />} />
              <Button shape="circle" icon={<PictureOutlined />} />
              <Button shape="circle" icon={<AudioOutlined />} className="ml-auto" />
              <Button shape="circle" icon={<ArrowUpOutlined />} onClick={submitUserFeedback} />
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}

export default ProjectWorkbench
