import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { AudioOutlined } from '@ant-design/icons'
import { NodeChrome, useIsCompactZoom } from '../NodeChrome'
import { useUiStore } from '../../../state/uiStore'
import { nodeWidthOf } from '../../../pages/Canvas/hooks/useNodeOperations'
import type { BaseNodeData } from '../../../types/canvas'
import '../genericNodes.css'

/** 通用音频节点（计划书 §14）：只留"输入台词以及人物描述"一个输入口。
 *  女娲短剧配音主用 MiniMax Speech 2.8 HD，但后端目前未接通任何音频供应商
 *  （已在交付说明标注为差距），因此这里是完整 UI + 占位生成，点击生成会提示"待接入"。 */
function AudioNodeInner({ id, data, selected }: NodeProps) {
  const d = data as unknown as BaseNodeData & { url?: string }
  const compact = useIsCompactZoom()
  const setActiveDialog = useUiStore((s) => s.setActiveDialogNodeId)
  const activeDialogNodeId = useUiStore((s) => s.activeDialogNodeId)

  return (
    <div onClick={() => setActiveDialog(activeDialogNodeId === id ? null : id)}>
      <NodeChrome
        id={id}
        typeLabel="音频"
        title={d.title || '音频节点'}
        width={nodeWidthOf('audio')}
        status={d.status}
        errorMessage={d.error}
        selected={selected}
        compact={compact}
        data={d}
        aboveLabel={`AUDIO · ${id.slice(-4)}`}
      >
        {d.url ? (
          <audio src={d.url} controls style={{ width: '100%' }} />
        ) : (
          <div className="nw-node-empty">
            <AudioOutlined style={{ fontSize: 32 }} />
            <span>点击输入台词以及人物描述</span>
          </div>
        )}
      </NodeChrome>
    </div>
  )
}

export const AudioNode = memo(AudioNodeInner)
