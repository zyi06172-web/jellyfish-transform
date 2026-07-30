import { DownloadOutlined, LinkOutlined, ReloadOutlined } from '@ant-design/icons'
import type { NodeProps } from '@xyflow/react'
import { memo } from 'react'
import { NODE_WIDTH, type PropNodeData } from '../../../pages/Canvas/types'
import { NodeLayout } from '../NodeLayout'
import { NodeEmptyState } from '../NodeStates'

/** PropNode 区分独立道具与穿戴配饰，穿戴类不单独出图。 */
function PropNodeBase({ id, data, selected }: NodeProps) {
  const nodeData = data as PropNodeData

  return (
    <NodeLayout
      id={id}
      type="prop"
      title={`道具 · ${nodeData.name || '未命名道具'}`}
      subtitle={nodeData.is_wearable ? '随人物生成 · 见角色资产' : '独立道具资产'}
      width={NODE_WIDTH.prop}
      status={nodeData.status}
      errorMessage={nodeData.error}
      selected={selected}
      cost={nodeData.is_wearable ? undefined : nodeData.cost}
      handles={{ target: true, source: true }}
      data={nodeData}
      toolbar={[
        { key: 'rerender', icon: <ReloadOutlined />, tooltip: '重渲为新节点', onClick: () => undefined },
        { key: 'jump', icon: <LinkOutlined />, tooltip: '跳到角色资产', onClick: () => undefined },
        { key: 'download', icon: <DownloadOutlined />, tooltip: '下载道具图', onClick: () => undefined },
      ]}
    >
      {nodeData.is_wearable ? (
        <NodeEmptyState label="穿戴类配饰不单独出图，会写入角色圣经并穿在人物身上。" />
      ) : nodeData.image ? (
        <div className="nuwa-square-preview"><img src={nodeData.image} alt={nodeData.name} /></div>
      ) : (
        <NodeEmptyState label="等待生成独立道具图。" />
      )}
    </NodeLayout>
  )
}

export const PropNode = memo(PropNodeBase)
