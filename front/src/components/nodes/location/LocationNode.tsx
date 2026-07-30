import { CameraOutlined, DownloadOutlined, ReloadOutlined } from '@ant-design/icons'
import type { NodeProps } from '@xyflow/react'
import { memo } from 'react'
import { DEFAULT_CANVAS_RATIO, NODE_WIDTH, type LocationNodeData } from '../../../pages/Canvas/types'
import { NodeLayout } from '../NodeLayout'
import { NodeEmptyState } from '../NodeStates'

/** LocationNode 展示场景资产与多机位入口，比例来自项目设置。 */
function LocationNodeBase({ id, data, selected }: NodeProps) {
  const nodeData = data as LocationNodeData
  const ratio = nodeData.subtitle || DEFAULT_CANVAS_RATIO
  const images = nodeData.images ?? []

  return (
    <NodeLayout
      id={id}
      type="location"
      title={`场景 · ${nodeData.name || '未命名场景'}`}
      subtitle={[nodeData.time_of_day, nodeData.mood, nodeData.style].filter(Boolean).join(' · ')}
      width={NODE_WIDTH.location}
      status={nodeData.status}
      errorMessage={nodeData.error}
      selected={selected}
      cost={nodeData.cost}
      handles={{ target: true, source: true }}
      data={nodeData}
      toolbar={[
        { key: 'rerender', icon: <ReloadOutlined />, tooltip: '重渲为新节点', onClick: () => undefined },
        { key: 'camera', icon: <CameraOutlined />, tooltip: '加机位', onClick: () => undefined },
        { key: 'download', icon: <DownloadOutlined />, tooltip: '下载场景图', onClick: () => undefined },
      ]}
    >
      {images.length ? (
        <div className="nuwa-wide-preview" style={{ aspectRatio: ratio.replace(':', ' / ') }}>
          {images.map((url) => <img key={url} src={url} alt={nodeData.name} />)}
        </div>
      ) : (
        <NodeEmptyState label="等待生成场景资产图。" />
      )}
    </NodeLayout>
  )
}

export const LocationNode = memo(LocationNodeBase)
