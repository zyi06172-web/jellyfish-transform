import { FileImageOutlined } from '@ant-design/icons'
import { Empty, Tag } from 'antd'
import type { AgentWorkspaceSnapshotRead } from '../../../../../services/generated'

function firstPreviewImage(snapshot: AgentWorkspaceSnapshotRead | null): string | null {
  const artifacts = Object.values(snapshot?.artifacts ?? {}) as any[]
  for (const item of artifacts) {
    const fileId = item?.content_json?.file_id || item?.content_json?.image_file_id
    const url = item?.content_json?.url || item?.content_json?.image_url
    if (typeof url === 'string' && url) return url
    if (typeof fileId === 'string' && fileId) return `/api/v1/studio/files/${fileId}/content`
  }
  return null
}

export function PreviewPane({
  project,
  snapshot,
}: {
  project: { name?: string | null } | null | undefined
  snapshot: AgentWorkspaceSnapshotRead | null
}) {
  const imageUrl = firstPreviewImage(snapshot)
  const summary = snapshot?.artifacts?.['story_summary:v1']?.content_text

  return (
    <main className="flex min-h-0 flex-col border-l border-white/[.06] bg-white/[.035] text-white">
      <div className="h-16 shrink-0 border-b border-white/[.06] px-5 py-4">
        <div className="truncate text-base font-semibold">{project?.name ?? '项目预览'}</div>
        <div className="text-xs text-white/42">预览框锁定 9:16，图片保持 contain</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="mx-auto w-full max-w-[360px] rounded-lg bg-white/[.07] p-3">
          <div className="relative aspect-[9/16] overflow-hidden rounded-lg bg-black">
            {imageUrl ? (
              <img src={imageUrl} alt="preview" className="h-full w-full object-contain" />
            ) : (
              <div className="flex h-full flex-col items-center justify-center px-5 text-center text-white/42">
                <FileImageOutlined className="mb-3 text-3xl" />
                <div className="text-sm font-semibold">{snapshot?.stage === 'elements_gen' ? '正在生成 9:16 元素图' : '等待元素图'}</div>
                <div className="mt-2 text-xs leading-relaxed">出图完成后，角色/场景/道具参考图会显示在这里且不会被拉伸。</div>
              </div>
            )}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Tag className="mr-0 rounded-full border-0 bg-white/[.10] text-white">9:16</Tag>
          <Tag className="mr-0 rounded-full border-0 bg-white/[.10] text-white">object-fit: contain</Tag>
          <Tag className="mr-0 rounded-full border-0 bg-white/[.10] text-white">{snapshot?.status ?? 'loading'}</Tag>
        </div>
        <div className="mt-5 rounded-lg border border-white/[.08] bg-white/[.06] p-4 shadow-sm">
          <div className="mb-2 text-xs font-semibold text-white/42">当前记忆</div>
          {summary ? <p className="text-sm leading-relaxed text-white/62">{summary}</p> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="等待剧情分析写入" />}
        </div>
      </div>
    </main>
  )
}
