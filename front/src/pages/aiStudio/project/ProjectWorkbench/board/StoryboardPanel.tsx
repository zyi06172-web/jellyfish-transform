import { CheckCircleOutlined, ClockCircleOutlined, PictureOutlined } from '@ant-design/icons'
import { Empty, Tag } from 'antd'
import type { AgentWorkspaceSnapshotRead } from '../../../../../services/generated'

const stageLabels: Record<string, string> = {
  intake: '剧情理解',
  spec_review: '规格确认',
  storyboard: '拆分镜',
  extract: '资产提取',
  auto_confirm: 'L3 关联',
  elements_gen: '元素出图',
  elements_review: '出图确认',
}

export function StoryboardPanel({ snapshot }: { snapshot: AgentWorkspaceSnapshotRead | null }) {
  const artifacts = snapshot?.artifacts ?? {}
  const summary = artifacts['story_summary:v1']?.content_text
  const elementArtifacts = Object.values(artifacts).filter((item: any) => item?.kind && item.kind !== 'story_summary')
  const stages = ['intake', 'spec_review', 'storyboard', 'extract', 'auto_confirm', 'elements_gen', 'elements_review']

  return (
    <section className="flex min-h-0 flex-col border-r border-black/6 bg-white">
      <div className="h-16 shrink-0 border-b border-black/6 px-5 py-4">
        <div className="text-base font-semibold">故事板</div>
        <div className="text-xs text-black/42">真实快照恢复</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="mb-5 rounded-lg border border-black/6 bg-black/[.025] p-4">
          <div className="mb-2 text-xs font-semibold text-black/42">当前阶段</div>
          <div className="text-xl font-semibold">{stageLabels[snapshot?.stage ?? ''] ?? '正在分析剧情…'}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {stages.map((stage) => {
              const done = snapshot?.confirmed_stages?.includes(stage) || snapshot?.completed_stages?.includes(stage)
              const active = snapshot?.stage === stage
              return (
                <Tag
                  key={stage}
                  className="mr-0 rounded-full border-0"
                  color={active ? 'default' : undefined}
                  icon={done ? <CheckCircleOutlined /> : <ClockCircleOutlined />}
                >
                  {stageLabels[stage]}
                </Tag>
              )
            })}
          </div>
        </div>
        {summary ? (
          <div className="mb-5 rounded-lg border border-black/6 bg-white p-4 shadow-sm">
            <div className="mb-2 text-xs font-semibold text-black/42">剧情摘要</div>
            <p className="text-sm leading-relaxed text-black/64">{summary}</p>
          </div>
        ) : (
          <div className="mb-5 rounded-lg border border-dashed border-black/10 bg-white p-5 text-sm text-black/42">
            正在分析剧情…
          </div>
        )}
        {elementArtifacts.length ? (
          <div className="space-y-3">
            {elementArtifacts.map((item: any) => (
              <div key={item.id} className="rounded-lg border border-black/6 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <PictureOutlined /> {item.content_json?.name ?? item.kind}
                </div>
                <div className="mt-1 line-clamp-2 text-xs text-black/42">{item.content_text}</div>
              </div>
            ))}
          </div>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="出图完成后显示真实关键元素" />
        )}
      </div>
    </section>
  )
}
