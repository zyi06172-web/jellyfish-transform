import type { ReactNode } from 'react'
import { memo, useMemo, useState } from 'react'
import { CopyOutlined, DeleteOutlined, EyeOutlined, RedoOutlined, PushpinOutlined } from '@ant-design/icons'
import { Button, Modal, Tooltip } from 'antd'
import { Handle, Position } from '@xyflow/react'
import type { CanvasNodeStatus, CanvasNodeType, ToolbarItem } from '../../pages/Canvas/types'
import { NodeToolbar } from './NodeToolbar'
import { NodeErrorState, NodeLoadingState } from './NodeStates'

type NodeLayoutProps = {
  id: string
  type: CanvasNodeType
  title: string
  subtitle?: string
  width: number
  status: CanvasNodeStatus
  errorMessage?: string
  cost?: { model: string; tokens?: number; cny?: number }
  toolbar?: ToolbarItem[]
  handles: { target: boolean; source: boolean }
  selected?: boolean
  data: unknown
  children: ReactNode
  onCopy?: () => void
  onFocus?: () => void
  onDelete?: () => void
  onRetry?: () => void
}

type NodeOpsCarrier = {
  __compact?: boolean
  __ops?: {
    copy: (nodeId: string) => void
    focus: (nodeId: string) => void
    delete: (nodeId: string) => void
    derive: (nodeId: string, patch?: Record<string, unknown>) => void
  }
}

/** NodeLayout 统一节点外壳、连接点、状态、右键菜单和开发态数据查看。 */
function NodeLayoutBase({
  id,
  type,
  title,
  subtitle,
  width,
  status,
  errorMessage,
  cost,
  toolbar = [],
  handles,
  selected,
  data,
  children,
  onCopy,
  onFocus,
  onDelete,
  onRetry,
}: NodeLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [dataOpen, setDataOpen] = useState(false)
  const canInspect = import.meta.env.DEV
  const mergedToolbar = useMemo(() => toolbar, [toolbar])
  const nodeMeta = data as NodeOpsCarrier | null
  const ops = nodeMeta?.__ops
  const compact = nodeMeta?.__compact === true

  return (
    <div
      className={`nuwa-node-shell ${compact ? 'nuwa-node-shell-compact' : ''} ${selected ? 'nuwa-node-shell-selected' : ''} ${status === 'error' ? 'nuwa-node-shell-error' : ''}`}
      style={{ width }}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
        setMenuOpen(true)
      }}
    >
      {handles.target ? <Handle type="target" position={Position.Left} /> : null}
      {selected ? <NodeToolbar items={mergedToolbar} /> : null}
      <div className="nuwa-node-header">
        <div className="min-w-0">
          <div className="nuwa-node-title">{title}</div>
          {subtitle ? <div className="nuwa-node-subtitle">{subtitle}</div> : null}
        </div>
        <Tooltip title={type}>
          <span className="nuwa-node-type">{type}</span>
        </Tooltip>
      </div>
      {compact ? null : (
        <div className="nuwa-node-body">
          {status === 'loading' ? <NodeLoadingState /> : null}
          {status === 'error' ? <NodeErrorState message={errorMessage || ''} onRetry={onRetry} /> : children}
        </div>
      )}
      <div className="nuwa-node-footer">
        <span>{id.slice(0, 18)}</span>
        {cost?.cny ? <span>≈¥{cost.cny.toFixed(2)}</span> : null}
      </div>
      {handles.source ? <Handle type="source" position={Position.Right} /> : null}

      <Modal
        open={menuOpen}
        footer={null}
        title={title}
        onCancel={() => setMenuOpen(false)}
        width={320}
      >
        <div className="flex flex-col gap-2">
          <Button icon={<CopyOutlined />} onClick={() => { setMenuOpen(false); onCopy?.(); ops?.copy(id) }}>复制节点</Button>
          <Button icon={<RedoOutlined />} onClick={() => { setMenuOpen(false); ops?.derive(id, { status: 'empty' }) }}>重做生成为新节点</Button>
          <Button icon={<PushpinOutlined />} onClick={() => { setMenuOpen(false); onFocus?.(); ops?.focus(id) }}>居中聚焦</Button>
          {canInspect ? <Button icon={<EyeOutlined />} onClick={() => setDataOpen(true)}>查看节点数据</Button> : null}
          <Button
            danger
            icon={<DeleteOutlined />}
            onClick={() => {
              Modal.confirm({
                title: '删除这个历史节点？',
                content: '删除后只影响画布显示，不会自动删除已生成的资产文件。',
                okText: '删除',
                okButtonProps: { danger: true },
                cancelText: '取消',
                onOk: () => {
                  setMenuOpen(false)
                  onDelete?.()
                  ops?.delete(id)
                },
              })
            }}
          >
            删除节点
          </Button>
        </div>
      </Modal>
      <Modal open={dataOpen} footer={null} title="节点数据" onCancel={() => setDataOpen(false)} width={720}>
        <pre className="max-h-[70vh] overflow-auto rounded bg-black p-4 text-xs text-white">
          {JSON.stringify(data, null, 2)}
        </pre>
      </Modal>
    </div>
  )
}

export const NodeLayout = memo(NodeLayoutBase)
