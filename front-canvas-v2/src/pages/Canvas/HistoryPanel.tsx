import { Tabs, Empty } from 'antd'
import { CloseOutlined } from '@ant-design/icons'
import { useReactFlow } from '@xyflow/react'
import { useUiStore } from '../../state/uiStore'
import { useCanvasFlow } from './CanvasFlowContext'
import './historyPanel.css'

interface HistoryItem {
  nodeId: string
  url: string
  title: string
  kind: 'image' | 'video'
}

/** §1.3 历史记录面板：图片历史 / 视频历史两 tab。
 *  数据来自当前画布上已产出结果的节点（关键帧/角色/场景/商品/通用图片 → 图片；
 *  视频节点/素材视频 → 视频），点缩略图聚焦到对应节点。 */
export function HistoryPanel() {
  const open = useUiStore((s) => s.activePanel) === 'history'
  const setActivePanel = useUiStore((s) => s.setActivePanel)
  const { nodes } = useCanvasFlow()
  const { setCenter } = useReactFlow()

  const images: HistoryItem[] = []
  const videos: HistoryItem[] = []

  for (const n of nodes) {
    const d = n.data as Record<string, unknown>
    const title = (d.title as string) || n.type || '节点'
    // 关键帧 frames
    const frames = d.frames as Array<{ url?: string }> | undefined
    if (Array.isArray(frames)) {
      frames.forEach((f) => f.url && images.push({ nodeId: n.id, url: f.url, title, kind: 'image' }))
    }
    // 角色/场景/道具 reference_images
    const refs = d.reference_images as Array<{ url?: string }> | undefined
    if (Array.isArray(refs)) {
      refs.forEach((r) => r.url && images.push({ nodeId: n.id, url: r.url, title, kind: 'image' }))
    }
    // 商品/通用图片/素材 url
    const url = (d.url as string) || (d.heroUrl as string)
    if (url) {
      if (n.type === 'video_shot' || n.type === 'video' || d.media_kind === 'video') videos.push({ nodeId: n.id, url, title, kind: 'video' })
      else images.push({ nodeId: n.id, url, title, kind: 'image' })
    }
  }

  const focus = (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId)
    if (node) setCenter(node.position.x + 180, node.position.y + 120, { zoom: 0.9, duration: 500 })
  }

  const grid = (items: HistoryItem[], emptyText: string) =>
    items.length === 0 ? (
      <Empty description={emptyText} style={{ marginTop: 40 }} />
    ) : (
      <div className="nw-history-grid">
        {items.map((it, i) => (
          <div key={`${it.nodeId}_${i}`} className="nw-history-item" onClick={() => focus(it.nodeId)} title={it.title}>
            {it.kind === 'video' ? <video src={it.url} className="nw-history-thumb" /> : <img src={it.url} className="nw-history-thumb" />}
            <div className="nw-history-caption">{it.title}</div>
          </div>
        ))}
      </div>
    )

  if (!open) return null

  return (
    <div className="nw-side-panel">
      <div className="nw-side-panel-head">
        <span>历史记录</span>
        <button className="nw-icon-btn" onClick={() => setActivePanel(null)}>
          <CloseOutlined />
        </button>
      </div>
      <Tabs
        tabBarStyle={{ padding: '0 16px' }}
        items={[
          { key: 'image', label: `图片历史 (${images.length})`, children: grid(images, '还没有生成过图片') },
          { key: 'video', label: `视频历史 (${videos.length})`, children: grid(videos, '还没有生成过视频') },
        ]}
      />
    </div>
  )
}
