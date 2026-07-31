import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { PictureOutlined } from '@ant-design/icons'
import { NodeChrome, useIsCompactZoom } from '../NodeChrome'
import { useUiStore } from '../../../state/uiStore'
import { nodeWidthOf } from '../../../pages/Canvas/hooks/useNodeOperations'
import type { BaseNodeData } from '../../../types/canvas'
import '../genericNodes.css'

/** 通用图片节点（计划书 §4/§11.3/§15）。自由创作场景下的标准生成节点；
 *  在短剧 workflow 里，真正的资产生成走 character/location/prop 专用节点 ——
 *  这个通用节点保留给"额外补一张自由发挥的图"的场景，符合"结构自由"。
 *  说明：后端没有不挂靠实体的通用生图接口（已在交付说明列出），因此这里的生成
 *  需要连一个上游 character/location/prop 节点才能真的调用后端；未连接时给出清楚提示，
 *  不假装能直接出图。 */
function ImageNodeInner({ id, data, selected }: NodeProps) {
  const d = data as unknown as BaseNodeData & { images?: string[] }
  const compact = useIsCompactZoom()
  const setActiveDialog = useUiStore((s) => s.setActiveDialogNodeId)
  const activeDialogNodeId = useUiStore((s) => s.activeDialogNodeId)

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
        {d.images?.length ? (
          <div className="nw-media-grid">
            {d.images.map((src) => (
              <img key={src} src={src} className="nw-media-thumb" />
            ))}
          </div>
        ) : (
          <div className="nw-node-empty">
            <PictureOutlined style={{ fontSize: 32 }} />
            <span>点击设置生成参数</span>
          </div>
        )}
      </NodeChrome>
    </div>
  )
}

export const ImageNode = memo(ImageNodeInner)
