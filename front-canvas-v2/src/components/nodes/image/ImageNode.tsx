import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { PictureOutlined } from '@ant-design/icons'
import { NodeChrome, useIsCompactZoom } from '../NodeChrome'
import { useUiStore } from '../../../state/uiStore'
import { nodeWidthOf } from '../../../pages/Canvas/hooks/useNodeOperations'
import type { BaseNodeData } from '../../../types/canvas'
import '../genericNodes.css'

/** 通用图片节点（§4 / §11.3）。点节点出对话框，填提示词后走火山 Seedream 真出图
 *  （GenerationDock.runImage → imageGen）；上游连了素材/图片节点时会把它们的 file_id
 *  作为参照图。电商预设工作流的各生图节点就是这种通用图片节点，预置了专业英文 prompt。 */
function ImageNodeInner({ id, data, selected }: NodeProps) {
  const d = data as unknown as BaseNodeData & { images?: string[]; url?: string }
  const compact = useIsCompactZoom()
  const setActiveDialog = useUiStore((s) => s.setActiveDialogNodeId)
  const activeDialogNodeId = useUiStore((s) => s.activeDialogNodeId)
  const gallery = d.images?.length ? d.images : d.url ? [d.url] : []

  return (
    <div onClick={() => setActiveDialog(activeDialogNodeId === id ? null : id)}>
      <NodeChrome
        id={id}
        typeLabel="图片"
        title={d.title || '图片节点'}
        width={nodeWidthOf('image')}
        status={d.status}
        errorMessage={d.error}
        selected={selected}
        compact={compact}
        data={d}
        aboveLabel={`IMAGE · ${id.slice(-4)}`}
      >
        {gallery.length ? (
          <div className={gallery.length > 1 ? 'nw-media-grid' : ''}>
            {gallery.map((src) => (
              <img key={src} src={src} className="nw-media-thumb" style={{ width: '100%' }} />
            ))}
          </div>
        ) : (
          <div className="nw-node-empty">
            <PictureOutlined style={{ fontSize: 32 }} />
            <span>点击设置提示词并生成</span>
          </div>
        )}
      </NodeChrome>
    </div>
  )
}

export const ImageNode = memo(ImageNodeInner)
