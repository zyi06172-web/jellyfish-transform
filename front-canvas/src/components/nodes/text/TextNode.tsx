import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { FileTextOutlined } from '@ant-design/icons'
import { NodeChrome, useIsCompactZoom } from '../NodeChrome'
import { useUiStore } from '../../../state/uiStore'
import { nodeWidthOf } from '../../../pages/Canvas/hooks/useNodeOperations'
import type { BaseNodeData } from '../../../types/canvas'

function TextNodeInner({ id, data, selected }: NodeProps) {
  const d = data as unknown as BaseNodeData
  const compact = useIsCompactZoom()
  const setActiveDialog = useUiStore((s) => s.setActiveDialogNodeId)
  const activeDialogNodeId = useUiStore((s) => s.activeDialogNodeId)

  return (
    <div onClick={() => setActiveDialog(activeDialogNodeId === id ? null : id)}>
      <NodeChrome
        id={id}
        typeLabel="文本"
        title={d.title || '文本节点'}
        width={nodeWidthOf('text')}
        status={d.status}
        errorMessage={d.error}
        selected={selected}
        compact={compact}
        data={d}
        aboveLabel={`TEXT · ${id.slice(-4)}`}
      >
        {d.status === 'ready' && d.text ? (
          <div className="nw-text-preview">{d.text as string}</div>
        ) : (
          <div className="nw-node-empty">
            <FileTextOutlined style={{ fontSize: 32 }} />
            <span>点击撰写文本</span>
          </div>
        )}
      </NodeChrome>
    </div>
  )
}

export const TextNode = memo(TextNodeInner)
