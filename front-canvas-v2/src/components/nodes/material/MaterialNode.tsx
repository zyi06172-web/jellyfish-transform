import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { NodeChrome, useIsCompactZoom } from '../NodeChrome'
import { nodeWidthOf } from '../../../pages/Canvas/hooks/useNodeOperations'
import type { BaseNodeData } from '../../../types/canvas'
import '../genericNodes.css'

interface MaterialData extends BaseNodeData {
  media_kind?: 'image' | 'video'
  local_url?: string
  url?: string
  file_id?: string
}

/** 素材节点（§8.2）：上传后的图片/视频，显示缩略图/视频首帧，可连线喂给下游生成节点当参照。 */
function MaterialNodeInner({ id, data, selected }: NodeProps) {
  const d = data as unknown as MaterialData
  const compact = useIsCompactZoom()
  const src = d.url || d.local_url

  return (
    <NodeChrome
      id={id}
      typeLabel={d.media_kind === 'video' ? '素材·视频' : '素材·图片'}
      title={d.title || '上传素材'}
      subtitle={d.status === 'loading' ? '上传中…' : d.status === 'ready' ? '已入库' : undefined}
      width={nodeWidthOf('material')}
      status={d.status}
      errorMessage={d.error}
      selected={selected}
      compact={compact}
      data={d}
      handles={{ target: false, source: true }}
    >
      {src ? (
        d.media_kind === 'video' ? (
          <video src={src} controls className="nw-video-preview" />
        ) : (
          <img src={src} className="nw-media-thumb" style={{ width: '100%' }} />
        )
      ) : (
        <div className="nw-node-empty">等待上传…</div>
      )}
    </NodeChrome>
  )
}

export const MaterialNode = memo(MaterialNodeInner)
