import { memo, useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import { NodeChrome, useIsCompactZoom } from '../NodeChrome'
import { nodeWidthOf } from '../../../pages/Canvas/hooks/useNodeOperations'
import { useUiStore } from '../../../state/uiStore'
import { analyzeScriptLocally } from '../../../services/promptIntelligence'
import { useNodeOperations } from '../../../pages/Canvas/hooks/useNodeOperations'
import type { ScriptSceneAnalysis } from '../../../types/canvas'
import '../genericNodes.css'

interface ScriptData {
  raw_script?: string
  stage?: string
  artifacts?: Record<string, unknown>
  analysis?: ScriptSceneAnalysis
}

/** N1 剧本节点（业务附件 §6 N1）：原文折叠显示 + 三要素提取状态。
 *  解析走后端 script_divider_agent（通过 agent 对话触发），本节点是只读投影，
 *  "在对话框补齐"直接聚焦右侧引导面板。 */
function ScriptNodeInner({ id, data, selected }: NodeProps) {
  const d = data as unknown as ScriptData
  const compact = useIsCompactZoom()
  const [expanded, setExpanded] = useState(false)
  const setAgentOpen = useUiStore((s) => s.setAgentOpen)
  const { patchNodeData } = useNodeOperations()

  const raw = d.raw_script ?? ''
  const preview = expanded ? raw : raw.slice(0, 160)
  const stageDone = (stageName: string) => {
    const order = ['script', 'assets', 'storyboard', 'shotlist_preview', 'render', 'shotlist_render', 'video']
    const cur = order.indexOf(d.stage ?? '')
    return cur > order.indexOf(stageName)
  }

  const focusChat = () => setAgentOpen(true)
  const analyze = () => {
    if (!raw.trim()) return
    patchNodeData(id, { analysis: analyzeScriptLocally(raw) })
  }

  return (
    <NodeChrome
      id={id}
      typeLabel="剧本"
      title="剧本"
      width={nodeWidthOf('script')}
      status={raw ? 'ready' : 'empty'}
      selected={selected}
      compact={compact}
      data={d}
    >
      {raw ? (
        <>
          <div className="nw-script-raw">
            {preview}
            {raw.length > 160 && (
              <button className="nw-link-btn" onClick={() => setExpanded((v) => !v)}>
                {expanded ? '收起' : '展开'}
              </button>
            )}
          </div>
          <div className="nw-script-divider">解析结果</div>
          {d.analysis ? (
            <div className="nw-script-analysis">
              <div><b>事件</b><span>{d.analysis.scene_event}</span></div>
              <div><b>人物状态</b><span>{d.analysis.character_state}</span></div>
              <div><b>场景样子</b><span>{d.analysis.scene_appearance}</span></div>
              <div><b>环境情绪</b><span>{d.analysis.environment_mood}</span></div>
              <div><b>心理暗示</b><span>{d.analysis.psychological_cue}</span></div>
              <div><b>角色心理</b><span>{d.analysis.character_psychology}</span></div>
            </div>
          ) : (
            <button className="nw-btn nw-btn-secondary" style={{ marginBottom: 8 }} onClick={analyze}>
              结构化剧情分析
            </button>
          )}
          <div className="nw-script-row">
            <span>故事构成</span>
            <span className={stageDone('script') || d.stage !== 'script' ? 'ok' : 'pending'}>
              {d.stage !== 'script' ? '✓ 已提取' : '⚠ 待确认'}
            </span>
          </div>
          <div className="nw-script-row">
            <span>角色/资产</span>
            <span className={stageDone('assets') ? 'ok' : 'pending'}>{stageDone('assets') ? '✓ 已提取' : '⚠ 进行中，去对话框补齐'}</span>
          </div>
          <div className="nw-script-row">
            <span>分镜信息</span>
            <span className={stageDone('storyboard') ? 'ok' : 'pending'}>{stageDone('storyboard') ? '✓ 已提取' : '⚠ 待生成'}</span>
          </div>
          <button className="nw-btn nw-btn-secondary" style={{ marginTop: 8 }} onClick={focusChat}>
            在对话框补齐 / 重解析
          </button>
        </>
      ) : (
        <div className="nw-node-empty">
          在右侧对话框贴入剧本原文开始
          <button className="nw-btn" onClick={focusChat}>
            打开对话框
          </button>
        </div>
      )}
    </NodeChrome>
  )
}

export const ScriptNode = memo(ScriptNodeInner)
