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
    title: '制作方向を確認してください',
    body: '剧情已分析完毕。接下来需要确认视频比例、时长和影像质感。',
    action: '縦型（9:16）・1〜2分・写実的ドラマスタイルで制作開始',
    detail: 'SNS・ショートドラマ向けの縦型フォーマット、リアルな映像表現で制作を進める',
  },
  characters: {
    title: 'キャラクター画像の生成へ進みますか？',
    body: '我会同时准备角色、场景、服装和道具，让 Key Elements 可以直接进入分镜。',
    action: 'キャラクター画像の生成へ進む',
    detail: '苏眠・傅寒舟・苏婉・医生の参照用キャラクター画像を生成して制作を続ける',
  },
  audio: {
    title: '音声リファレンスをどう作りますか？',
    body: '如果没有上传声音样本，可以先用低消耗旁白模型生成角色音频引用。',
    action: 'ナレーションモデルで音声を生成する（クレジット消費が少ない）',
    detail: '各キャラクターの脚本から3〜5秒のセリフを抽出し、key_element_audioに登録する',
  },
  animation: {
    title: 'アニメーション生成へ進みますか？',
    body: '分镜、关键元素、音频引用已经排布完成。下一步可以生成动画草稿。',
    action: '現在のストーリーボードでアニメーション生成を開始',
    detail: '不满意的角色或镜头可以在右侧随时提出，只局部重生成，不影响主进度',
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
      { name: 'Element_ヒロイン_苏眠', kind: '画像', color: 'green', desc: '白裙、受伤妆、压抑但倔强' },
      { name: 'Element_婚约者_傅寒舟', kind: '画像', color: 'blue', desc: '高级黑西装、冷峻表情' },
      { name: 'Element_妹妹_苏婉', kind: '画像', color: 'purple', desc: '礼服、虚伪笑容、反派气质' },
      { name: 'Element_医生', kind: '画像', color: 'cyan', desc: '白衣、眼镜、专业表情' },
    ]
  }
  return [
    { name: 'Element_主人公', kind: '画像', color: 'green', desc: '核心角色参考图' },
    { name: 'Element_对手角色', kind: '画像', color: 'blue', desc: '冲突人物参考图' },
    { name: 'Element_主场景', kind: '画像', color: 'purple', desc: '主要空间与氛围' },
    { name: 'Element_关键道具', kind: '画像', color: 'cyan', desc: '推动剧情的道具' },
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
      <div className="flex h-full items-center justify-center bg-[#050505] text-white">
        <div className="text-center">
          <Empty description={<span className="text-white/50">项目不存在</span>} />
          <Link to="/projects">
            <Button ghost icon={<ArrowLeftOutlined />}>
              返回主页
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[330px_minmax(360px,1fr)_560px] gap-3 overflow-hidden bg-[#050505] p-3 text-white">
      <aside className="flex min-h-0 flex-col overflow-hidden rounded-[22px] border border-white/12 bg-[#0b0b0d]/92">
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
          <div className="flex items-center gap-3 text-xl font-bold">
            <DownOutlined className="text-xs text-white/50" />
            ストーリーボード
          </div>
          <EllipsisOutlined className="text-xl text-white/60" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <section className="border-b border-white/10 p-5">
            <div className="mb-4 flex items-center gap-3 text-xl font-bold">
              <DownOutlined className="text-xs text-white/50" />
              キーエレメント
            </div>
            <div className="space-y-5">
              {keyElements.map((element) => (
                <div key={element.name}>
                  <div className="mb-3 flex items-center gap-2 text-base font-semibold text-white/56">
                    <DownOutlined className="text-xs" />
                    {element.name}
                  </div>
                  <div className="ml-9 flex items-end gap-2">
                    <div className="flex h-[72px] w-[132px] items-center rounded-2xl bg-gradient-to-br from-[#29313a] to-[#415261] px-4 text-sm text-white/46">
                      <AudioOutlined className="mr-2" /> Element...
                    </div>
                    <div className={`h-[96px] w-[68px] rounded-2xl border-2 border-${element.color}-400 bg-[linear-gradient(160deg,rgba(255,255,255,.24),rgba(255,255,255,.05))]`} />
                    <button className="h-9 w-9 rounded-xl border border-dashed border-white/24 text-xl text-white/40">+</button>
                  </div>
                  <div className="ml-9 mt-2 flex gap-2">
                    <Tag color="green" className="mr-0 bg-white/10">
                      {element.kind}
                    </Tag>
                    <span className="truncate text-xs text-white/36">{element.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3 text-xl font-bold">
                <DownOutlined className="text-xs text-white/50" />
                未分類素材
              </div>
              <span className="text-sm text-white/36">すべて</span>
            </div>
            <div className="flex h-[220px] flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[.025] text-center text-white/22">
              <PlusOutlined className="mb-4 text-2xl" />
              ストーリーボードに配置されていない生成済み素材がここに表示されます。
            </div>
          </section>
        </div>
        <div className="flex h-16 items-center justify-center gap-4 border-t border-white/10">
          <Button shape="round" ghost>−</Button>
          <span className="font-semibold text-white/70">70%</span>
          <Button shape="round" ghost>+</Button>
        </div>
      </aside>

      <main className="flex min-h-0 flex-col overflow-hidden rounded-[22px] border border-white/12 bg-[#09090a]/95">
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
          <div className="min-w-0 text-xl font-bold">
            プレビュー <span className="text-base font-normal text-white/25">Element_ヒロイン_苏眠_img</span>
          </div>
          <div className="flex gap-2">
            <Tag className="rounded-full border-white/10 bg-white/5 px-4 py-1 text-white/54">Nano B...</Tag>
            <Tag className="rounded-full border-white/10 bg-white/5 px-4 py-1 text-white/54">1K (76...)</Tag>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-[560px] rounded-[30px] bg-[#111] p-4">
            <div className="relative aspect-[9/16] overflow-hidden rounded-[24px] bg-[radial-gradient(circle_at_32%_36%,rgba(255,255,255,.30),transparent_18%),linear-gradient(140deg,#1a2329,#2b3944_42%,#101013)]">
              <div className="absolute left-0 top-0 h-full w-[49%] border-r border-white/20 bg-[radial-gradient(circle_at_52%_27%,rgba(255,230,214,.72),transparent_18%),linear-gradient(180deg,rgba(148,163,184,.42),rgba(15,23,42,.42))]" />
              <div className="absolute right-[10%] top-[16%] h-[72%] w-[28%] rounded-t-full bg-[linear-gradient(180deg,rgba(255,255,255,.86),rgba(226,232,240,.55))]" />
              <div className="absolute bottom-8 left-6 max-w-[240px] rounded-2xl bg-black/36 p-4 backdrop-blur">
                <div className="text-sm text-white/48">剧情总结</div>
                <div className="mt-2 line-clamp-6 text-lg leading-relaxed text-white">
                  {story}
                </div>
              </div>
              <button className="absolute left-5 top-[44%] flex h-14 w-14 items-center justify-center rounded-full bg-black/40 text-white/70">
                <UpOutlined />
              </button>
              <button className="absolute bottom-[35%] left-5 flex h-14 w-14 items-center justify-center rounded-full bg-black/40 text-white/70">
                <DownOutlined />
              </button>
            </div>
          </div>
        </div>
        <div className="flex h-16 items-center justify-center gap-4 border-t border-white/10 px-5">
          <Button ghost shape="round" icon={<AudioOutlined />}>プロンプト</Button>
          <Button ghost shape="round" icon={<ReloadOutlined />}>再生成</Button>
          {chapters[0] && projectId ? (
            <Button type="primary" shape="round" onClick={() => navigate(getChapterStudioPath(projectId, chapters[0].id))}>
              真实分镜工作室
            </Button>
          ) : null}
        </div>
      </main>

      <aside className="flex min-h-0 flex-col overflow-hidden rounded-[22px] border border-white/12 bg-[#0b0b0d]/95">
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-6">
          <div className="text-xl font-bold">チャット</div>
          <Button shape="circle" type="text" className="text-white/45">×</Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
          <div className="mb-6 space-y-3 text-lg leading-relaxed text-white/75">
            <div>• ✅ {project?.name ?? '新项目'} — Agent がタイトルを生成</div>
            <div>• ✅ 剧情总结已写入项目记忆</div>
            <div>• ✅ Key Elements 初稿已准备</div>
          </div>
          <div className="my-8 h-px bg-white/10" />
          <div className="text-lg leading-relaxed text-white/72">
            <p>{activeStepCopy.body}</p>
            <p className="mt-4">{activeStepCopy.title}</p>
          </div>
          <button
            type="button"
            onClick={advanceStep}
            className="mt-8 w-full rounded-[26px] border border-white/8 bg-gradient-to-br from-[#41251f] via-[#1b2021] to-[#152615] p-7 text-left text-lg leading-relaxed text-white shadow-2xl transition hover:border-[#a9c86b]/50"
          >
            <div className="font-bold">{activeStepCopy.action}</div>
            <div className="mt-2 text-white/70">{activeStepCopy.detail}</div>
            <div className="mt-5 flex justify-end">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/40">
                <ArrowUpOutlined />
              </span>
            </div>
          </button>
          {agentNotes.length ? (
            <div className="mt-8 space-y-3">
              {agentNotes.map((note, index) => (
                <div key={`${note}-${index}`} className="rounded-2xl bg-white/[.055] px-4 py-3 text-sm text-white/62">
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
                  className={`h-2 flex-1 rounded-full ${index <= activeStepIndex ? 'bg-[#a9c86b]' : 'bg-white/12'}`}
                />
              ))}
            </div>
            <Progress
              percent={Math.round(((activeStepIndex + 1) / steps.length) * 100)}
              showInfo={false}
              strokeColor="#a9c86b"
              trailColor="rgba(255,255,255,.1)"
            />
          </div>
        </div>
        <div className="border-t border-white/10 p-4">
          <div className="rounded-[26px] border border-white/12 bg-black/70 p-3">
            <Input.TextArea
              value={messageText}
              onChange={(event) => setMessageText(event.target.value)}
              autoSize={{ minRows: 2, maxRows: 4 }}
              bordered={false}
              className="flova-chat-input"
              placeholder="メッセージを入力..."
              onPressEnter={(event) => {
                if (event.metaKey || event.ctrlKey) submitFreeMessage()
              }}
            />
            <div className="mt-3 flex items-center gap-3">
              <Button shape="circle" ghost icon={<PlusOutlined />} />
              <Button shape="circle" ghost icon={<AppstoreOutlined />} />
              <Button shape="circle" ghost icon={<PictureOutlined />} />
              <Button shape="circle" ghost icon={<AudioOutlined />} className="ml-auto" />
              <Button shape="circle" icon={<ArrowUpOutlined />} onClick={submitFreeMessage} />
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}

export default ProjectWorkbench
