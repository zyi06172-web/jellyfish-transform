import { DownloadOutlined, ReloadOutlined, SwapOutlined } from '@ant-design/icons'
import type { NodeProps } from '@xyflow/react'
import { memo } from 'react'
import { Button } from 'antd'
import { DEFAULT_CANVAS_RATIO, NODE_WIDTH, type KeyframeNodeData } from '../../../pages/Canvas/types'
import { NodeLayout } from '../NodeLayout'
import { NodeEmptyState } from '../NodeStates'

/** KeyframeNode 展示逐格超写实关键帧，支持单张重渲为派生节点。 */
function KeyframeNodeBase({ id, data, selected }: NodeProps) {
  const nodeData = data as KeyframeNodeData
  const frames = nodeData.frames ?? []
  const ratio = DEFAULT_CANVAS_RATIO.replace(':', ' / ')

  return (
    <NodeLayout
      id={id}
      type="keyframe"
      title={nodeData.title || `关键帧渲染 · ${frames.length || 5} 张`}
      subtitle={nodeData.seed ? `seed 固定 ✓ ${nodeData.seed}` : 'seed 等待写入'}
      width={NODE_WIDTH.keyframe}
      status={nodeData.status}
      errorMessage={nodeData.error}
      selected={selected}
      cost={nodeData.cost}
      handles={{ target: true, source: true }}
      data={nodeData}
      toolbar={[
        { key: 'rerender-all', icon: <ReloadOutlined />, tooltip: '全部重渲为新节点', onClick: () => undefined },
        { key: 'seed', icon: <SwapOutlined />, tooltip: '换 seed', onClick: () => undefined },
        { key: 'download', icon: <DownloadOutlined />, tooltip: '打包下载', onClick: () => undefined },
      ]}
    >
      {frames.length ? (
        <div className="nuwa-keyframe-grid">
          {frames.map((frame) => (
            <div key={frame.panel_index} className="nuwa-keyframe-cell">
              <div className="nuwa-frame-preview" style={{ aspectRatio: ratio }}>
                {frame.url ? <img src={frame.url} alt={`关键帧 ${frame.panel_index}`} /> : <NodeEmptyState label={frame.status === 'loading' ? '生成中' : '等待'} />}
              </div>
              <Button size="small" icon={<ReloadOutlined />}>重渲</Button>
            </div>
          ))}
        </div>
      ) : (
        <NodeEmptyState label="文字分镜表确认后，逐格生成 5 张超写实关键帧。" />
      )}
    </NodeLayout>
  )
}

export const KeyframeNode = memo(KeyframeNodeBase)
