import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { GiftOutlined } from '@ant-design/icons'
import { NodeChrome, useIsCompactZoom } from '../NodeChrome'
import { nodeWidthOf } from '../../../pages/Canvas/hooks/useNodeOperations'
import { useReactFlow } from '@xyflow/react'
import { useCanvasFlow } from '../../../pages/Canvas/CanvasFlowContext'
import { AssetQuickGenerate } from '../AssetQuickGenerate'
import '../genericNodes.css'

interface RefImage {
  image_id: number
  url: string
}
interface PropData {
  name?: string
  reference_images?: RefImage[]
  is_wearable?: boolean
  worn_by_character_node_id?: string
  extracted_description?: string
}

/** N4 道具节点（业务附件 §6 N4）：可穿戴道具不单独出图，指向对应角色节点。 */
function PropNodeInner({ id, data, selected }: NodeProps) {
  const d = data as unknown as PropData
  const compact = useIsCompactZoom()
  const { setCenter } = useReactFlow()
  const { nodes } = useCanvasFlow()
  const cover = d.reference_images?.[0]

  const jumpToCharacter = () => {
    if (!d.worn_by_character_node_id) return
    const node = nodes.find((n) => n.id === d.worn_by_character_node_id)
    if (node) setCenter(node.position.x + 180, node.position.y + 100, { zoom: 0.9, duration: 500 })
  }

  return (
    <NodeChrome
      id={id}
      typeLabel="道具"
      title={`道具 · ${d.name ?? ''}`}
      width={nodeWidthOf('prop')}
      status={d.is_wearable || cover ? 'ready' : d.extracted_description ? 'empty' : 'loading'}
      selected={selected}
      compact={compact}
      data={d}
    >
      {d.is_wearable ? (
        <div className="nw-gate-hint">
          随人物生成 · 见角色资产
          <div>
            <button className="nw-link-btn" onClick={jumpToCharacter}>
              跳转到对应角色节点 →
            </button>
          </div>
        </div>
      ) : cover ? (
        <img src={cover.url} className="nw-media-thumb" style={{ width: '100%' }} />
      ) : (
        <div className="nw-node-empty">
          {d.extracted_description ? (
            <AssetQuickGenerate nodeId={id} kind="prop" name={d.name} description={d.extracted_description} />
          ) : (
            <>
              <GiftOutlined style={{ fontSize: 28 }} />
              <span>等待 agent 对话生成道具图…</span>
            </>
          )}
        </div>
      )}
    </NodeChrome>
  )
}

export const PropNode = memo(PropNodeInner)
