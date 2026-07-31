import { ReactNode, useState, useCallback, memo } from 'react'
import { Handle, Position, useStore } from '@xyflow/react'
import { Modal, message } from 'antd'
import {
  CopyOutlined,
  DeleteOutlined,
  AimOutlined,
  ReloadOutlined,
  CodeOutlined,
  EditOutlined,
} from '@ant-design/icons'
import type { NodeStatus } from '../../types/canvas'
import { useCanvasFlow } from '../../pages/Canvas/CanvasFlowContext'
import { useNodeOperations } from '../../pages/Canvas/hooks/useNodeOperations'
import { NodeToolbar } from './NodeToolbar'
import './nodeChrome.css'

export interface ToolbarItem {
  key: string
  icon: ReactNode
  tooltip: string
  danger?: boolean
  onClick: () => void
}

interface NodeChromeProps {
  id: string
  typeLabel: string
  title: string
  subtitle?: string
  width: number
  status: NodeStatus
  errorMessage?: string
  onRetry?: () => void
  costText?: string
  handles?: { target?: boolean; source?: boolean }
  toolbar?: ToolbarItem[]
  selected?: boolean
  compact?: boolean
  data?: unknown
  /** 卡片顶部外侧的小标签，如 TEXT1（计划书 §4.3） */
  aboveLabel?: string
  children: ReactNode
}

/** 所有节点共用外壳：标题条/连接点/右键菜单/加载态/错误态/开发态/低缩放简化渲染 */
function NodeChromeInner({
  id,
  typeLabel,
  title,
  subtitle,
  width,
  status,
  errorMessage,
  onRetry,
  costText,
  handles = { target: true, source: true },
  toolbar,
  selected,
  compact,
  data,
  aboveLabel,
  children,
}: NodeChromeProps) {
  const { setNodes } = useCanvasFlow()
  const { focusNode } = useNodeOperations()
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)
  const [devDataOpen, setDevDataOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(title)

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setMenuPos({ x: e.clientX, y: e.clientY })
  }, [])

  const closeMenu = () => setMenuPos(null)

  const doCopy = () => {
    const newId = `${id}_copy_${Date.now().toString(36)}`
    setNodes((prev) => {
      const node = prev.find((n) => n.id === id)
      if (!node) return prev
      return [...prev, { ...node, id: newId, position: { x: node.position.x + 40, y: node.position.y + 40 }, selected: false }]
    })
    message.success('已复制节点')
    closeMenu()
  }

  const doDelete = () => {
    closeMenu()
    Modal.confirm({
      title: '删除该节点？',
      content: '删除后不可恢复。只有你自己可以删除节点，系统不会自动删除已生成的结果。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => setNodes((prev) => prev.filter((n) => n.id !== id)),
    })
  }

  const doFocus = () => {
    focusNode(id)
    closeMenu()
  }

  const commitRename = () => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, data: { ...n.data, title: renameValue } } : n)))
    setRenaming(false)
  }

  if (compact) {
    return (
      <div className={`nw-node nw-node-compact ${selected ? 'is-selected' : ''}`} style={{ width }} onContextMenu={onContextMenu}>
        {handles?.target && <Handle type="target" position={Position.Left} className="nw-handle" />}
        <div className="nw-node-compact-title">{title}</div>
        {handles?.source && <Handle type="source" position={Position.Right} className="nw-handle" />}
        {menuPos && (
          <NodeMenu pos={menuPos} onClose={closeMenu} onCopy={doCopy} onDelete={doDelete} onFocus={doFocus} />
        )}
      </div>
    )
  }

  return (
    <div
      className={`nw-node status-${status} ${selected ? 'is-selected' : ''}`}
      style={{ width }}
      onContextMenu={onContextMenu}
    >
      {aboveLabel && <div className="nw-node-above-label">{aboveLabel}</div>}
      {handles?.target && <Handle type="target" position={Position.Left} className="nw-handle" />}
      {handles?.source !== false && <Handle type="source" position={Position.Right} className="nw-handle" />}

      <div className="nw-node-head">
        <div className="nw-node-headtext">
          {renaming ? (
            <input
              autoFocus
              className="nw-node-rename-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') setRenaming(false)
              }}
            />
          ) : (
            <>
              <span className="nw-node-title">{title}</span>
              {subtitle && <span className="nw-node-subtitle">{subtitle}</span>}
            </>
          )}
        </div>
        <span className="nw-node-type-tag">{typeLabel}</span>
      </div>

      <div className="nw-node-body">
        {status === 'loading' && (
          <div className="nw-node-loading-overlay">
            <div className="nw-spinner" />
            <div className="nw-loading-text">正在生成…</div>
          </div>
        )}
        {status === 'error' ? (
          <div className="nw-node-error">
            <div className="nw-node-error-text">{errorMessage || '生成失败，原因未知'}</div>
            {onRetry && (
              <button className="nw-btn nw-btn-danger" onClick={onRetry}>
                <ReloadOutlined /> 重试
              </button>
            )}
          </div>
        ) : (
          children
        )}
      </div>

      <NodeToolbar items={toolbar ?? []} visible={!!selected} />

      {costText && (
        <div className="nw-node-foot">
          <div className="nw-node-cost">{costText}</div>
        </div>
      )}

      {menuPos && (
        <NodeMenu
          pos={menuPos}
          onClose={closeMenu}
          onCopy={doCopy}
          onDelete={doDelete}
          onFocus={doFocus}
          onRename={() => {
            setRenaming(true)
            closeMenu()
          }}
          onViewData={
            import.meta.env.DEV
              ? () => {
                  setDevDataOpen(true)
                  closeMenu()
                }
              : undefined
          }
        />
      )}

      <Modal open={devDataOpen} onCancel={() => setDevDataOpen(false)} footer={null} title="节点数据（开发态）">
        <pre className="nw-dev-json">{JSON.stringify(data, null, 2)}</pre>
      </Modal>
    </div>
  )
}

function NodeMenu({
  pos,
  onClose,
  onCopy,
  onDelete,
  onFocus,
  onRename,
  onViewData,
}: {
  pos: { x: number; y: number }
  onClose: () => void
  onCopy: () => void
  onDelete: () => void
  onFocus: () => void
  onRename?: () => void
  onViewData?: () => void
}) {
  return (
    <>
      <div className="nw-menu-backdrop" onClick={onClose} />
      <div className="nw-context-menu" style={{ left: pos.x, top: pos.y }}>
        {onRename && (
          <div className="nw-context-item" onClick={onRename}>
            <EditOutlined /> 重命名
          </div>
        )}
        <div className="nw-context-item" onClick={onCopy}>
          <CopyOutlined /> 复制节点
        </div>
        <div className="nw-context-item" onClick={onFocus}>
          <AimOutlined /> 居中聚焦
        </div>
        {onViewData && (
          <div className="nw-context-item" onClick={onViewData}>
            <CodeOutlined /> 查看节点数据
          </div>
        )}
        <div className="nw-context-item danger" onClick={onDelete}>
          <DeleteOutlined /> 删除
        </div>
      </div>
    </>
  )
}

export const NodeChrome = memo(NodeChromeInner)

/** 供节点组件判断当前是否处于低缩放简化渲染阈值 */
export function useIsCompactZoom() {
  return useStore((s) => s.transform[2] < 0.5)
}
