import { ReloadOutlined, TableOutlined } from '@ant-design/icons'
import type { NodeProps } from '@xyflow/react'
import { memo } from 'react'
import { NODE_WIDTH, type StoryboardNodeData, type StoryboardPanel } from '../../../pages/Canvas/types'
import { NodeLayout } from '../NodeLayout'
import { NodeEmptyState } from '../NodeStates'

function visiblePanels(panels?: StoryboardPanel[]) {
  const rows = panels ?? []
  return Array.from({ length: 6 }, (_, index) => rows.find((panel) => panel.index === index + 1) ?? {
    index: index + 1,
    one_sentence_summary: index === 5 ? '空白' : '等待故事板',
    is_blank: index === 5,
  })
}

/** StoryboardNode 固定展示 3×2 六格故事板，六要素只留在 data 里。 */
function StoryboardNodeBase({ id, data, selected }: NodeProps) {
  const nodeData = data as StoryboardNodeData
  const page = nodeData.content_json?.pages?.[0]
  const panels = visiblePanels(page?.panels)

  return (
    <NodeLayout
      id={id}
      type="storyboard"
      title={nodeData.title || '手绘故事板 · 镜1-6'}
      subtitle="1 页 6 格 · 第 6 格空白"
      width={NODE_WIDTH.storyboard}
      status={nodeData.status}
      errorMessage={nodeData.error}
      selected={selected}
      cost={nodeData.cost}
      handles={{ target: true, source: true }}
      data={nodeData}
      toolbar={[
        { key: 'rerender-page', icon: <ReloadOutlined />, tooltip: '重出整页为新节点', onClick: () => undefined },
        { key: 'shotlist', icon: <TableOutlined />, tooltip: '下一步：分镜表', onClick: () => undefined },
      ]}
    >
      <div className="nuwa-storyboard-grid">
        {panels.map((panel) => (
          <div key={panel.index} className="nuwa-storyboard-cell">
            <div className="nuwa-storyboard-index">{panel.index}</div>
            {page?.image_url && !panel.is_blank ? <img src={page.image_url} alt={`storyboard-${panel.index}`} /> : null}
            <div className="nuwa-storyboard-summary">{panel.one_sentence_summary}</div>
          </div>
        ))}
      </div>
      {!page ? <NodeEmptyState label="故事板生成后显示六格；六要素不会在画布节点上展开。" /> : null}
    </NodeLayout>
  )
}

export const StoryboardNode = memo(StoryboardNodeBase)
