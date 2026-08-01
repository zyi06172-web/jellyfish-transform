import { Fragment, memo, useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import { Modal } from 'antd'
import { NodeChrome, useIsCompactZoom } from '../NodeChrome'
import { nodeWidthOf, useNodeOperations } from '../../../pages/Canvas/hooks/useNodeOperations'
import { contentPanels, deriveCameraDesignSteps, type StoryboardPage } from '../../../services/workflowArtifacts'
import { estimateCost } from '../../../pages/Canvas/hooks/useGenerationCost'
import { useProjectSettings } from '../../../state/projectContext'
import '../genericNodes.css'
import './shotlistNode.css'

interface ShotlistTextData {
  page?: StoryboardPage
}

/** N8a 文字版分镜表节点 + 成本闸门①（业务附件 §9/§10）：免费预审，未确认前后端 0 生图调用。
 *  确认后在此新开 keyframe 节点，写入 5 个待生成 slot，交由 KeyframeNode 自己发起真实调用。 */
function ShotlistTextNodeInner({ id, data, selected }: NodeProps) {
  const d = data as unknown as ShotlistTextData
  const compact = useIsCompactZoom()
  const [expandedRow, setExpandedRow] = useState<number | null>(null)
  const { deriveNode } = useNodeOperations()
  const { aspectRatio } = useProjectSettings()
  const panels = contentPanels(d.page ?? null)

  const startRender = () => {
    const price = estimateCost('seedream-5.0-pro', panels.length)
    Modal.confirm({
      title: '开始渲染关键帧？',
      content: (
        <div>
          <p>做什么：为 {panels.length} 个镜头各渲染 1 张超写实关键帧</p>
          <p>生成几个：{panels.length} 张</p>
          <p>预估多少钱：≈¥{price.toFixed(2)}（估算，非实际扣费）</p>
          <p>用哪个模型：Seedream 5.0 Pro</p>
        </div>
      ),
      okText: '确认渲染',
      cancelText: '继续补充信息',
      onOk: () => {
        deriveNode(id, 'keyframe', {
          title: '关键帧渲染',
          panels,
          shots: d.page?.shots ?? [],
          ratio: aspectRatio,
          seed: Math.floor(Math.random() * 900000) + 100000,
          frames: panels.map((p) => ({ panel_index: p.shot_index, shot_id: p.shot_id, status: 'pending' as const })),
        })
      },
    })
  }

  if (!panels.length) {
    return (
      <NodeChrome id={id} typeLabel="分镜表（文字版）" title="分镜表（文字版）" width={nodeWidthOf('shotlist_text')} status="loading" selected={selected} compact={compact} data={d}>
        <div className="nw-node-empty">等待手绘故事板生成后自动同步</div>
      </NodeChrome>
    )
  }

  return (
    <NodeChrome
      id={id}
      typeLabel="分镜表（文字版）"
      title={`分镜表（文字版）· 格 1-${panels.length}`}
      width={nodeWidthOf('shotlist_text')}
      status="ready"
      selected={selected}
      compact={compact}
      data={d}
      toolbar={[]}
    >
      <table className="nw-shotlist-table">
        <thead>
          <tr>
            <th>格</th>
            <th>一句话总结</th>
            <th>情绪</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {panels.map((p) => {
            const group = d.page?.shots.find((s) => s.shot_group === p.shot_group)
            const steps = group ? deriveCameraDesignSteps(group) : null
            const open = expandedRow === p.shot_index
            return (
              <Fragment key={p.shot_index}>
                <tr className="nw-shotlist-row" onClick={() => setExpandedRow(open ? null : p.shot_index)}>
                  <td>{p.shot_index}</td>
                  <td>{p.visible_summary}</td>
                  <td>{p.emotion ?? '-'}</td>
                  <td>{open ? '收起' : '展开'}</td>
                </tr>
                {open && (
                  <tr className="nw-shotlist-expand">
                    <td colSpan={4}>
                      <div className="nw-shotlist-detail">
                        <div className="nw-shotlist-detail-title">六要素（供视频模型参照）</div>
                        {p.six_elements_for_video_model &&
                          Object.entries(p.six_elements_for_video_model).map(([k, v]) => (
                            <div key={k} className="nw-shotlist-kv">
                              <span>{k}</span>
                              <span>{v?.value}</span>
                            </div>
                          ))}
                        <div className="nw-shotlist-detail-title">运动逻辑</div>
                        <div>{group?.action_beats?.join(' → ') || '-'}</div>
                        {steps && (
                          <>
                            <div className="nw-shotlist-detail-title">镜头运动设计 6 项（近似推导，非后端结构化字段）</div>
                            <div className="nw-shotlist-kv"><span>确定跟随对象</span><span>{steps.followTarget}</span></div>
                            <div className="nw-shotlist-kv"><span>设计运动路线</span><span>{steps.motionPath}</span></div>
                            <div className="nw-shotlist-kv"><span>镜头解释空间</span><span>{steps.spaceExplain}</span></div>
                            <div className="nw-shotlist-kv"><span>主体关系变化</span><span>{steps.relationChange}</span></div>
                            <div className="nw-shotlist-kv"><span>设计停顿点</span><span>{steps.pausePoint}</span></div>
                            <div className="nw-shotlist-kv"><span>结尾信息变化</span><span>{steps.endingChange}</span></div>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
      <button className="nw-btn" style={{ marginTop: 10 }} onClick={startRender}>
        开始渲染（成本闸门①）
      </button>
    </NodeChrome>
  )
}

export const ShotlistTextNode = memo(ShotlistTextNodeInner)
