import { memo, useEffect, useMemo, useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import { useNodesData } from '@xyflow/react'
import { Modal } from 'antd'
import { NodeChrome, useIsCompactZoom } from '../NodeChrome'
import { nodeWidthOf, useNodeOperations } from '../../../pages/Canvas/hooks/useNodeOperations'
import type { StoryboardPanel, StoryboardShotGroup } from '../../../services/workflowArtifacts'
import type { KeyframeSlot } from '../keyframe/KeyframeNode'
import { StudioShotDetailsService } from '../../../services/generated'
import { estimateCost } from '../../../pages/Canvas/hooks/useGenerationCost'
import { useProjectSettings } from '../../../state/projectContext'
import '../genericNodes.css'
import './shotlistNode.css'

interface ShotlistRenderData {
  keyframeNodeId?: string
  panels?: StoryboardPanel[]
  shots?: StoryboardShotGroup[]
}

/** N8b 渲染版分镜表节点（业务附件 §6 N8b）：真表格，图片与 keyframe 同源
 *  （通过 useNodesData 直接读 keyframe 节点的 frames，不重复生图，原则3）。 */
function ShotlistRenderNodeInner({ id, data, selected }: NodeProps) {
  const d = data as unknown as ShotlistRenderData
  const compact = useIsCompactZoom()
  const keyframeData = useNodesData(d.keyframeNodeId ?? '') as { data?: { frames?: KeyframeSlot[] } } | undefined
  const frames = keyframeData?.data?.frames ?? []
  const panels = useMemo(() => d.panels ?? [], [d.panels])
  const [atmosphereByShot, setAtmosphereByShot] = useState<Record<string, string>>({})
  const { deriveNode } = useNodeOperations()
  const { aspectRatio } = useProjectSettings()

  useEffect(() => {
    let alive = true
    Promise.all(
      panels.map((p) =>
        StudioShotDetailsService.getShotDetailApiV1StudioShotDetailsShotIdGet({ shotId: p.shot_id })
          .then((res) => [p.shot_id, res.data?.atmosphere ?? ''] as const)
          .catch(() => [p.shot_id, ''] as const),
      ),
    ).then((pairs) => {
      if (alive) setAtmosphereByShot(Object.fromEntries(pairs))
    })
    return () => {
      alive = false
    }
  }, [panels])

  const exportPng = () => {
    window.print()
  }

  const startVideo = () => {
    const readyPanels = panels.filter((p) => frames.find((f) => f.panel_index === p.shot_index)?.url)
    const price = estimateCost('seedance-2.0', readyPanels.length)
    Modal.confirm({
      title: '确认，开始出视频？',
      content: (
        <div>
          <p>做什么：为 {readyPanels.length} 个镜头各出一段视频（复用已渲染的关键帧，不重复生图）</p>
          <p>生成几个：{readyPanels.length} 条</p>
          <p>预估多少钱：≈¥{price.toFixed(2)}（估算，非实际扣费）</p>
          <p>用哪个模型：Seedance 2.0</p>
        </div>
      ),
      okText: '确认出视频',
      cancelText: '再看看',
      onOk: () => {
        readyPanels.forEach((p) => {
          deriveNode(id, 'video_shot', {
            title: `镜头${p.shot_index}`,
            shot_label: `镜头${p.shot_index}`,
            shot_id: p.shot_id,
            ratio: aspectRatio,
            autoStart: true,
            status: 'loading',
          })
        })
      },
    })
  }

  return (
    <NodeChrome
      id={id}
      typeLabel="分镜表（渲染版）"
      title={`分镜表（渲染版）· 格 1-${panels.length}`}
      width={nodeWidthOf('shotlist_render')}
      status={panels.length ? 'ready' : 'loading'}
      selected={selected}
      compact={compact}
      data={d}
      toolbar={[]}
    >
      <table className="nw-shotlist-render-table">
        <thead>
          <tr>
            <th>格</th>
            <th>渲染图</th>
            <th>拍摄手法</th>
            <th>景别</th>
            <th>情绪</th>
            <th>运动逻辑</th>
            <th>环境氛围</th>
          </tr>
        </thead>
        <tbody>
          {panels.map((p) => {
            const frame = frames.find((f) => f.panel_index === p.shot_index)
            const group = d.shots?.find((s) => s.shot_group === p.shot_group)
            return (
              <tr key={p.shot_index}>
                <td>{['①', '②', '③', '④', '⑤'][p.shot_index - 1] ?? p.shot_index}</td>
                <td>{frame?.url ? <img src={frame.url} className="nw-shotlist-render-thumb" /> : '生成中'}</td>
                <td>{group?.movement ?? '-'}</td>
                <td>{group?.camera_shot ?? '-'}</td>
                <td>{p.emotion ?? '-'}</td>
                <td>{group?.action_beats?.join(' → ') || '-'}</td>
                <td>{atmosphereByShot[p.shot_id] || '-'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button className="nw-btn nw-btn-secondary" onClick={exportPng}>
          导出 PNG
        </button>
        <button className="nw-btn" onClick={startVideo}>
          确认，开始出视频（成本闸门②）
        </button>
      </div>
    </NodeChrome>
  )
}

export const ShotlistRenderNode = memo(ShotlistRenderNodeInner)
