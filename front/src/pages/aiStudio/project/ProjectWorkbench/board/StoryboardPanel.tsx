import {
  CheckCircleOutlined,
  FileImageOutlined,
  FileTextOutlined,
  NodeIndexOutlined,
  PictureOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { Empty, Progress, Tag, Tooltip } from 'antd'
import type { AgentMessageRead, AgentWorkspaceSnapshotRead } from '../../../../../services/generated'

type JsonRecord = Record<string, any>

type StoryboardPanelItem = {
  shot_index?: number
  shot_title?: string
  second?: number | null
  is_blank?: boolean
  visible_summary?: string
  shot_group?: number | null
  emotion?: string
  screen_direction_guidance?: string
  composition_anchor?: string
  six_elements_for_video_model?: JsonRecord
}

type StoryboardShotGroup = {
  shot_group?: number
  first_cell?: number
  last_cell?: number
  duration_seconds?: number
  camera_shot?: string
  angle?: string
  movement?: string
  subject?: string
  screen_direction?: string
  composition_anchor?: string
  reference_mode?: string
  motion_description?: string
  is_peak?: boolean
}

type StoryboardPage = {
  chapter_id?: string
  image_file_id?: string | null
  image_url?: string | null
  panels?: StoryboardPanelItem[]
  shots?: StoryboardShotGroup[]
  panel_to_shot?: Record<string, number>
}

const stageLabels: Record<string, string> = {
  intake: '剧情理解',
  spec_review: '规格确认',
  storyboard: '拆分镜',
  extract: '资产提取',
  auto_confirm: 'L3 关联',
  elements_gen: '元素出图',
  elements_review: '出图确认',
}

const stages = ['intake', 'spec_review', 'storyboard', 'extract', 'auto_confirm', 'elements_gen', 'elements_review']

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {}
}

function artifactContent(item: unknown): JsonRecord {
  return asRecord(asRecord(item).content_json)
}

function findStoryboardPage(snapshot: AgentWorkspaceSnapshotRead | null): StoryboardPage | null {
  const artifacts = Object.values(snapshot?.artifacts ?? {}) as unknown[]
  for (const item of artifacts) {
    const content = artifactContent(item)
    const pages = Array.isArray(content.pages) ? content.pages : []
    const page = pages.find((row: unknown) => Array.isArray(asRecord(row).panels))
    if (page) return asRecord(page) as StoryboardPage
  }
  return null
}

function taskUpdates(messages?: AgentMessageRead[]): AgentMessageRead[] {
  return (messages ?? []).filter((message) => message.kind === 'task_update').slice(-6)
}

function imageUrlFromPage(page: StoryboardPage | null): string | null {
  if (!page) return null
  if (page.image_url) return page.image_url
  if (page.image_file_id) return `/api/v1/studio/files/${page.image_file_id}/content`
  return null
}

function sixValue(panel: StoryboardPanelItem, key: string, field = 'value'): string {
  const row = asRecord(panel.six_elements_for_video_model?.[key])
  return String(row[field] ?? '').trim()
}

function stageProgress(snapshot: AgentWorkspaceSnapshotRead | null): number {
  const done = new Set([...(snapshot?.confirmed_stages ?? []), ...(snapshot?.completed_stages ?? [])])
  const completed = stages.filter((stage) => done.has(stage)).length
  return Math.round((completed / stages.length) * 100)
}

function compactText(value?: string | null, fallback = '暂无') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function StageTimeline({ snapshot }: { snapshot: AgentWorkspaceSnapshotRead | null }) {
  const done = new Set([...(snapshot?.confirmed_stages ?? []), ...(snapshot?.completed_stages ?? [])])
  const activeStage = snapshot?.stage ?? ''

  return (
    <div className="rounded-lg border border-black/6 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-black/42">当前阶段</div>
          <div className="mt-1 text-lg font-semibold">{stageLabels[activeStage] ?? '正在分析剧情…'}</div>
        </div>
        <div className="w-20">
          <Progress percent={stageProgress(snapshot)} size="small" showInfo={false} strokeColor="#1d1d1f" trailColor="rgba(0,0,0,.08)" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2">
        {stages.map((stage, index) => {
          const doneStage = done.has(stage)
          const active = activeStage === stage
          return (
            <div
              key={stage}
              className={`flex items-center gap-3 rounded-md border px-3 py-2 text-xs transition ${
                active
                  ? 'border-black/20 bg-black/[.035] text-black'
                  : doneStage
                    ? 'border-emerald-100 bg-emerald-50/70 text-emerald-900'
                    : 'border-black/6 bg-black/[.018] text-black/45'
              }`}
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[11px] shadow-sm">
                {doneStage ? <CheckCircleOutlined className="text-emerald-600" /> : index + 1}
              </div>
              <div className="min-w-0 flex-1 truncate">{stageLabels[stage]}</div>
              {active ? <Tag className="mr-0 rounded-full border-0 bg-black text-white">进行中</Tag> : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TaskUpdateList({ messages }: { messages: AgentMessageRead[] }) {
  if (!messages.length) {
    return (
      <div className="rounded-lg border border-dashed border-black/10 bg-white p-4 text-sm text-black/42">
        自动链启动后，这里显示拆分镜、提取、L3、出图和视频准备进度。
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-black/6 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <ThunderboltOutlined />
        自动链进度
      </div>
      <div className="space-y-2">
        {messages.map((message, index) => (
          <div key={`${message.content}-${index}`} className="flex gap-3 rounded-md bg-black/[.025] px-3 py-2">
            <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-black/45" />
            <div className="min-w-0">
              <div className="line-clamp-2 text-xs leading-relaxed text-black/66">{message.content}</div>
              {message.payload?.stage ? <div className="mt-1 text-[11px] text-black/35">{String(message.payload.stage)}</div> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function StoryboardPagePreview({ page }: { page: StoryboardPage | null }) {
  const panels = (page?.panels ?? []).slice(0, 6)
  const imageUrl = imageUrlFromPage(page)

  if (!page || panels.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="故事板页生成后显示 6 格审片视图" />
  }

  return (
    <div className="rounded-lg border border-black/6 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <FileImageOutlined />
          电影手绘故事板
        </div>
        <Tag className="mr-0 rounded-full border-0 bg-black/[.06]">2×3 · 5 秒</Tag>
      </div>
      {imageUrl ? (
        <div className="mb-3 overflow-hidden rounded-md border border-black/6 bg-black/[.035]">
          <img src={imageUrl} alt="storyboard page" className="aspect-video w-full object-contain" />
        </div>
      ) : null}
      <div className="grid grid-cols-3 gap-2">
        {panels.map((panel, index) => (
          <Tooltip
            key={`${panel.shot_index ?? index}-${panel.visible_summary ?? ''}`}
            title={panel.is_blank ? '空白结束格' : compactText(panel.visible_summary)}
          >
            <div
              className={`min-h-[76px] rounded-md border p-2 ${
                panel.is_blank ? 'border-dashed border-black/10 bg-black/[.015]' : 'border-black/6 bg-black/[.025]'
              }`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex h-5 w-5 items-center justify-center rounded bg-white text-[11px] font-semibold shadow-sm">
                  {panel.shot_index ?? index + 1}
                </div>
                {panel.shot_group ? <Tag className="mr-0 rounded-full border-0 text-[10px]">镜头 {panel.shot_group}</Tag> : null}
              </div>
              <div className="line-clamp-2 text-[11px] leading-relaxed text-black/60">
                {panel.is_blank ? '空白格' : compactText(panel.visible_summary)}
              </div>
            </div>
          </Tooltip>
        ))}
      </div>
    </div>
  )
}

function ShotGroups({ groups }: { groups: StoryboardShotGroup[] }) {
  if (!groups.length) return null

  return (
    <div className="rounded-lg border border-black/6 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <NodeIndexOutlined />
        镜头分组
      </div>
      <div className="space-y-3">
        {groups.map((group) => (
          <div key={group.shot_group} className="rounded-md border border-black/6 bg-black/[.02] p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold">镜头 {group.shot_group}</div>
              <div className="flex shrink-0 gap-1">
                {group.is_peak ? <Tag className="mr-0 rounded-full border-0 bg-rose-50 text-rose-700">峰值</Tag> : null}
                <Tag className="mr-0 rounded-full border-0 bg-black/[.06]">{group.duration_seconds ?? 1}s</Tag>
              </div>
            </div>
            <div className="mb-2 flex flex-wrap gap-1">
              <Tag className="mr-0 rounded-full border-0">{compactText(group.camera_shot, 'MS')}</Tag>
              <Tag className="mr-0 rounded-full border-0">{compactText(group.angle, 'EYE_LEVEL')}</Tag>
              <Tag className="mr-0 rounded-full border-0">{compactText(group.movement, 'STATIC')}</Tag>
              <Tag className="mr-0 rounded-full border-0">{compactText(group.reference_mode, 'first_last')}</Tag>
            </div>
            <div className="text-xs leading-relaxed text-black/62">
              格 {group.first_cell}-{group.last_cell}，{compactText(group.motion_description)}
            </div>
            <div className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-black/42">
              {compactText(group.screen_direction)} / {compactText(group.composition_anchor)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SixElementPanel({ page }: { page: StoryboardPage | null }) {
  const panels = (page?.panels ?? []).filter((panel) => !panel.is_blank).slice(0, 5)
  if (!panels.length) return null

  return (
    <div className="rounded-lg border border-black/6 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <FileTextOutlined />
        每格六要素
      </div>
      <div className="space-y-2">
        {panels.map((panel) => (
          <div key={`${panel.shot_index}-${panel.second}`} className="rounded-md bg-black/[.025] p-3">
            <div className="mb-2 flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-white text-[11px] font-semibold shadow-sm">
                {panel.shot_index}
              </div>
              <div className="min-w-0 flex-1 truncate text-xs font-semibold">{compactText(panel.shot_title)}</div>
              <Tag className="mr-0 rounded-full border-0 text-[10px]">{compactText(panel.emotion, '情绪')}</Tag>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-black/55">
              <div className="truncate">主体：{compactText(sixValue(panel, 'subject'))}</div>
              <div className="truncate">场景：{compactText(sixValue(panel, 'scene'))}</div>
              <div className="truncate">景别：{compactText(sixValue(panel, 'shot_size'))}</div>
              <div className="truncate">运镜：{compactText(sixValue(panel, 'camera'))}</div>
              <div className="col-span-2 line-clamp-2">灯光：{compactText(sixValue(panel, 'lighting'))}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function StoryboardPanel({ snapshot }: { snapshot: AgentWorkspaceSnapshotRead | null }) {
  const artifacts = snapshot?.artifacts ?? {}
  const summary = artifacts['story_summary:v1']?.content_text
  const page = findStoryboardPage(snapshot)
  const updates = taskUpdates(snapshot?.messages)
  const elementArtifacts = Object.values(artifacts).filter((item: any) => item?.kind && item.kind !== 'story_summary')

  return (
    <section className="flex min-h-0 flex-col border-r border-black/6 bg-white">
      <div className="h-16 shrink-0 border-b border-black/6 px-5 py-4">
        <div className="text-base font-semibold">工作流与故事板</div>
        <div className="text-xs text-black/42">阶段、自动链、分镜页与视频结构</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="space-y-5">
          <StageTimeline snapshot={snapshot} />
          {summary ? (
            <div className="rounded-lg border border-black/6 bg-white p-4 shadow-sm">
              <div className="mb-2 text-xs font-semibold text-black/42">剧情摘要</div>
              <p className="text-sm leading-relaxed text-black/64">{summary}</p>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-black/10 bg-white p-5 text-sm text-black/42">
              正在分析剧情…
            </div>
          )}
          <TaskUpdateList messages={updates} />
          <StoryboardPagePreview page={page} />
          <ShotGroups groups={page?.shots ?? []} />
          <SixElementPanel page={page} />
          {elementArtifacts.length ? (
            <div className="rounded-lg border border-black/6 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <PictureOutlined />
                关键元素
              </div>
              <div className="space-y-2">
                {elementArtifacts.slice(0, 6).map((item: any) => (
                  <div key={item.id} className="rounded-md bg-black/[.025] px-3 py-2">
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      <PictureOutlined /> {item.content_json?.name ?? item.kind}
                    </div>
                    <div className="mt-1 line-clamp-2 text-[11px] text-black/42">{item.content_text}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
