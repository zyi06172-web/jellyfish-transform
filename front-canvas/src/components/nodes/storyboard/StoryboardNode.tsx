import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { PictureOutlined } from '@ant-design/icons'
import { NodeChrome, useIsCompactZoom } from '../NodeChrome'
import { nodeWidthOf } from '../../../pages/Canvas/hooks/useNodeOperations'
import type { StoryboardPage } from '../../../services/workflowArtifacts'
import '../genericNodes.css'
import './storyboardNode.css'

interface StoryboardData {
  page?: StoryboardPage
}

/** N5 手绘故事板节点（业务附件 §6 N5）：固定 3×2 六格，1 秒 1 格，第 6 格空白且无六要素。
 *  后端一次生图产出"整页"手绘图（layout=2_rows_x_3_columns），无法二次裁出单格子图；
 *  因此这里展示整页原图 + 6 格文字信息条（序号 + 一句话总结），如实反映数据来源，
 *  不假装拥有 6 张独立子图。六要素不上屏（原则6），仅在开发态"查看节点数据"里可见。 */
function StoryboardNodeInner({ id, data, selected }: NodeProps) {
  const d = data as unknown as StoryboardData
  const compact = useIsCompactZoom()
  const page = d.page
  const ratio = page?.aspect_ratio || '16:9'

  if (!page) {
    return (
      <NodeChrome id={id} typeLabel="手绘故事板" title="手绘故事板" width={nodeWidthOf('storyboard')} status="loading" selected={selected} compact={compact} data={d}>
        <div className="nw-node-empty">
          <PictureOutlined style={{ fontSize: 28 }} />
          <span>等待 agent 生成 6 格故事板…</span>
        </div>
      </NodeChrome>
    )
  }

  const panels = [...page.panels].sort((a, b) => a.second - b.second)

  return (
    <NodeChrome
      id={id}
      typeLabel="手绘故事板"
      title={`手绘故事板 · 镜1-${panels.filter((p) => !p.is_blank).length}`}
      width={nodeWidthOf('storyboard')}
      status="ready"
      selected={selected}
      compact={compact}
      data={d}
    >
      {page.image_url && <img src={page.image_url} className="nw-storyboard-page" style={{ aspectRatio: ratio.replace(':', ' / ') }} />}
      <div className="nw-storyboard-grid">
        {panels.map((p) => (
          <div key={p.second} className={`nw-storyboard-cell ${p.is_blank ? 'blank' : ''}`}>
            <span className="nw-storyboard-index">{['①', '②', '③', '④', '⑤', '⑥'][p.second - 1] ?? p.second}</span>
            <span className="nw-storyboard-summary">{p.is_blank ? '空白' : p.visible_summary}</span>
          </div>
        ))}
      </div>
    </NodeChrome>
  )
}

export const StoryboardNode = memo(StoryboardNodeInner)
