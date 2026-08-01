import { memo, useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Modal } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import { useCanvasFlow } from '../../../pages/Canvas/CanvasFlowContext'
import { useIsCompactZoom } from '../NodeChrome'
import './stickyNode.css'

interface StickyData {
  title?: string
  text?: string
}

/** 便签节点（§8.1 + 附加要求）：画布上可编辑的**白色专业纸条**，便利贴样式，
 *  与生成节点用纸感 + 右上折角明显区分。双击进入编辑，内容存 node.data.text，
 *  随画布保存；可被其他生成节点用 @ 引用（引用逻辑在 GenerationDock）。
 *  自带 source 连接点，方便把便签内容连给下游节点。 */
function StickyNodeInner({ id, data, selected }: NodeProps) {
  const d = data as unknown as StickyData
  const compact = useIsCompactZoom()
  const { setNodes } = useCanvasFlow()
  const [editing, setEditing] = useState(false)
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)

  const setText = (text: string) => setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, data: { ...n.data, text } } : n)))

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setMenuPos({ x: e.clientX, y: e.clientY })
  }

  const doDelete = () => {
    setMenuPos(null)
    Modal.confirm({
      title: '删除该便签？',
      content: '删除后不可恢复。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => setNodes((prev) => prev.filter((n) => n.id !== id)),
    })
  }

  if (compact) {
    return (
      <div className={`nw-sticky ${selected ? 'is-selected' : ''}`} style={{ width: 240 }}>
        <Handle type="target" position={Position.Left} className="nw-handle" />
        <div className="nw-sticky-fold" />
        <div className="nw-sticky-compact">{d.text || '便签'}</div>
        <Handle type="source" position={Position.Right} className="nw-handle" />
      </div>
    )
  }

  return (
    <div className={`nw-sticky ${selected ? 'is-selected' : ''}`} style={{ width: 240 }} onContextMenu={onContextMenu} onDoubleClick={() => setEditing(true)}>
      <Handle type="target" position={Position.Left} className="nw-handle" />
      <Handle type="source" position={Position.Right} className="nw-handle" />
      <div className="nw-sticky-fold" />
      <div className="nw-sticky-tag">便签</div>
      {editing ? (
        <textarea
          className="nw-sticky-textarea"
          autoFocus
          value={d.text ?? ''}
          placeholder="写点公共提示词 / 灵感，其他节点可用 @ 引用…"
          onChange={(e) => setText(e.target.value)}
          onBlur={() => setEditing(false)}
        />
      ) : (
        <div className="nw-sticky-body">{d.text || <span className="nw-sticky-placeholder">双击编辑便签…</span>}</div>
      )}

      {menuPos && (
        <>
          <div className="nw-menu-backdrop" onClick={() => setMenuPos(null)} />
          <div className="nw-context-menu" style={{ left: menuPos.x, top: menuPos.y }}>
            <div className="nw-context-item danger" onClick={doDelete}>
              <DeleteOutlined /> 删除
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export const StickyNode = memo(StickyNodeInner)
