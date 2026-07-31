import { memo, useEffect, useRef } from 'react'
import type { NodeProps } from '@xyflow/react'
import { ReloadOutlined, DownloadOutlined, SwapOutlined, TableOutlined } from '@ant-design/icons'
import { NodeChrome, useIsCompactZoom } from '../NodeChrome'
import { useCanvasFlow } from '../../../pages/Canvas/CanvasFlowContext'
import { nodeWidthOf, useNodeOperations } from '../../../pages/Canvas/hooks/useNodeOperations'
import { buildKeyframePrompt, generateKeyframeForPanel } from '../../../services/generationRuntime'
import type { StoryboardPanel, StoryboardShotGroup } from '../../../services/workflowArtifacts'
import { useUiStore } from '../../../state/uiStore'
import { estimateCost } from '../../../pages/Canvas/hooks/useGenerationCost'
import '../genericNodes.css'
import './keyframeNode.css'

export interface KeyframeSlot {
  panel_index: number
  shot_id: string
  status: 'pending' | 'loading' | 'ready' | 'error'
  url?: string
  error?: string
  seed?: number
}

interface KeyframeData {
  panels?: StoryboardPanel[]
  shots?: StoryboardShotGroup[]
  frames?: KeyframeSlot[]
  ratio?: string
  seed?: number
}

/** N7 关键帧节点（业务附件 §6 N7）：5 张独立状态、独立重渲；seed 固定（后端未真正
 *  支持 seed 复用，已在交付说明标注为差距，这里的"seed"仅作为前端展示的一个稳定随机数，
 *  不保证跨次生成画面一致）。这是渲染版分镜表的唯一图片数据源（原则3）。 */
function KeyframeNodeInner({ id, data, selected }: NodeProps) {
  const d = data as unknown as KeyframeData
  const compact = useIsCompactZoom()
  const { setNodes } = useCanvasFlow()
  const { deriveNode } = useNodeOperations()
  const addCumulativeCost = useUiStore((s) => s.addCumulativeCost)
  const startedRef = useRef<Set<number>>(new Set())

  const frames = d.frames ?? []
  const ratio = d.ratio ?? '16:9'

  const patchFrame = (index: number, patch: Partial<KeyframeSlot>) => {
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== id) return n
        const nd = n.data as unknown as KeyframeData
        return { ...n, data: { ...n.data, frames: (nd.frames ?? []).map((f) => (f.panel_index === index ? { ...f, ...patch } : f)) } }
      }),
    )
  }

  const runFrame = async (slot: KeyframeSlot) => {
    const panel = d.panels?.find((p) => p.shot_index === slot.panel_index || p.second === slot.panel_index)
    if (!panel) return
    patchFrame(slot.panel_index, { status: 'loading', error: undefined })
    const result = await generateKeyframeForPanel({ shotId: slot.shot_id, prompt: buildKeyframePrompt(panel), ratio })
    if (result.error) {
      patchFrame(slot.panel_index, { status: 'error', error: result.error })
    } else {
      patchFrame(slot.panel_index, { status: 'ready', url: result.url })
      addCumulativeCost(estimateCost('seedream-5.0-pro'))
    }
  }

  useEffect(() => {
    frames
      .filter((f) => f.status === 'pending' && !startedRef.current.has(f.panel_index))
      .forEach((f) => {
        startedRef.current.add(f.panel_index)
        void runFrame(f)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames.map((f) => `${f.panel_index}:${f.status}`).join(',')])

  const regenerateAll = () => {
    deriveNode(id, 'keyframe', {
      title: '关键帧渲染',
      panels: d.panels,
      shots: d.shots,
      ratio,
      frames: frames.map((f) => ({ ...f, status: 'pending', url: undefined, error: undefined })),
    })
  }

  const downloadAll = () => {
    frames.forEach((f) => {
      if (f.url) window.open(f.url, '_blank')
    })
  }

  const readyCount = frames.filter((f) => f.status === 'ready').length

  const openShotlistRender = () => {
    deriveNode(id, 'shotlist_render', { title: '分镜表（渲染版）', keyframeNodeId: id, panels: d.panels, shots: d.shots })
  }

  return (
    <NodeChrome
      id={id}
      typeLabel="关键帧渲染"
      title={`关键帧渲染 · ${frames.length} 张`}
      subtitle={`seed 固定 ✓ ${d.seed ?? ''}`}
      width={nodeWidthOf('keyframe')}
      status={readyCount === frames.length && frames.length > 0 ? 'ready' : 'loading'}
      selected={selected}
      compact={compact}
      data={d}
      costText={`≈¥${(readyCount * estimateCost('seedream-5.0-pro')).toFixed(2)}`}
      toolbar={[
        { key: 'redo-all', icon: <ReloadOutlined />, tooltip: '全部重渲（新开节点）', onClick: regenerateAll },
        { key: 'shotlist', icon: <TableOutlined />, tooltip: '生成渲染版分镜表', onClick: openShotlistRender },
        { key: 'download', icon: <DownloadOutlined />, tooltip: '打包下载', onClick: downloadAll },
      ]}
    >
      <div className="nw-keyframe-grid">
        {frames.map((f) => (
          <div key={f.panel_index} className="nw-keyframe-cell">
            <div className="nw-keyframe-index">
              {['①', '②', '③', '④', '⑤'][f.panel_index - 1] ?? f.panel_index}
              {f.status === 'loading' && <span className="nw-keyframe-spin">⟳</span>}
            </div>
            {f.status === 'ready' && f.url ? (
              <img src={f.url} className="nw-media-thumb" />
            ) : f.status === 'error' ? (
              <div className="nw-keyframe-error">{f.error}</div>
            ) : (
              <div className="nw-keyframe-placeholder" />
            )}
            <button className="nw-icon-btn" title="重渲这一张" onClick={() => runFrame({ ...f, status: 'pending' })}>
              <SwapOutlined />
            </button>
          </div>
        ))}
      </div>
    </NodeChrome>
  )
}

export const KeyframeNode = memo(KeyframeNodeInner)
