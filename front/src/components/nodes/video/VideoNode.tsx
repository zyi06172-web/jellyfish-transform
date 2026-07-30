import { DownloadOutlined, EyeOutlined, ReloadOutlined } from '@ant-design/icons'
import type { NodeProps } from '@xyflow/react'
import { memo, useState } from 'react'
import { Modal } from 'antd'
import { DEFAULT_CANVAS_RATIO, NODE_WIDTH, type VideoNodeData } from '../../../pages/Canvas/types'
import { NodeLayout } from '../NodeLayout'
import { NodeEmptyState } from '../NodeStates'

/** VideoNode 是链路终点，提供内嵌播放、提示词查看、下载和重出入口。 */
function VideoNodeBase({ id, data, selected }: NodeProps) {
  const nodeData = data as VideoNodeData
  const [promptOpen, setPromptOpen] = useState(false)
  const ratio = (nodeData.aspect_ratio || DEFAULT_CANVAS_RATIO).replace(':', ' / ')

  return (
    <NodeLayout
      id={id}
      type="video"
      title={nodeData.title || `视频 · 镜头${nodeData.shot_index ?? ''}`}
      subtitle={[nodeData.duration ? `${nodeData.duration}s` : '', nodeData.resolution, 'Seedance 2.0'].filter(Boolean).join(' · ')}
      width={NODE_WIDTH.video}
      status={nodeData.status}
      errorMessage={nodeData.error}
      selected={selected}
      cost={nodeData.cost}
      handles={{ target: true, source: false }}
      data={nodeData}
      toolbar={[
        { key: 'rerender', icon: <ReloadOutlined />, tooltip: '重出为新节点', onClick: () => undefined },
        { key: 'prompt', icon: <EyeOutlined />, tooltip: '看提示词', onClick: () => setPromptOpen(true) },
        { key: 'download', icon: <DownloadOutlined />, tooltip: '下载视频', onClick: () => undefined },
      ]}
    >
      {nodeData.url ? (
        <video src={nodeData.url} controls className="nuwa-video-preview" style={{ aspectRatio: ratio }} />
      ) : (
        <NodeEmptyState label="渲染版分镜表确认后，逐镜头生成 Seedance 视频。" />
      )}
      <Modal open={promptOpen} footer={null} title="视频提示词" onCancel={() => setPromptOpen(false)}>
        <pre className="whitespace-pre-wrap text-sm">{nodeData.prompt_used || '暂无提示词记录'}</pre>
      </Modal>
    </NodeLayout>
  )
}

export const VideoNode = memo(VideoNodeBase)
