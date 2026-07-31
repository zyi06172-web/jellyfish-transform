import { useEffect, useRef, useState } from 'react'
import { Spin, message as antMessage } from 'antd'
import { SendOutlined } from '@ant-design/icons'
import { fetchWorkspace, submitTurn } from '../../services/agentClient'
import type { AgentWorkspaceSnapshotRead } from '../../services/generated'
import { useUiStore } from '../../state/uiStore'
import { CANVAS_TYPE_CONFIGS } from '../../types/canvasTypeConfig'
import './agentPanel.css'

interface AgentPanelProps {
  projectId: string
  onWorkspaceUpdated: (snapshot: AgentWorkspaceSnapshotRead, rawTextIfScript?: string) => void
}

/** 右侧引导面板（形态二，业务附件 §7.2 / 计划书 §7.2）：Claude Code 式问答栏，
 *  一次只问一件事，选项按钮 + 可选自由输入，灰字给出记入例（默认值）。 */
export function AgentPanel({ projectId, onWorkspaceUpdated }: AgentPanelProps) {
  const open = useUiStore((s) => s.chatPanelOpen)
  const canvasType = useUiStore((s) => s.canvasType)
  const config = CANVAS_TYPE_CONFIGS[canvasType]
  const [snapshot, setSnapshot] = useState<AgentWorkspaceSnapshotRead | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [text, setText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const load = async () => {
    setLoading(true)
    try {
      const snap = await fetchWorkspace(projectId)
      if (snap) setSnapshot(snap)
    } catch {
      antMessage.error('未能读取 agent 工作台快照，请确认后端已启动')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [snapshot?.messages?.length])

  const send = async (input: { type: 'text'; text: string } | { type: 'choice'; choice_id: string }) => {
    if (!snapshot) return
    setSubmitting(true)
    const rawScriptIfAny = input.type === 'text' && (snapshot.stage === 'script' || snapshot.messages?.length === 0) ? input.text : undefined
    try {
      const turn = await submitTurn(projectId, input, snapshot.revision)
      if (turn) {
        const next: AgentWorkspaceSnapshotRead = {
          ...snapshot,
          revision: turn.revision,
          stage: turn.stage,
          question_card: turn.question_card ?? null,
          messages: [...(snapshot.messages ?? []), { role: 'user', kind: input.type, content: input.type === 'text' ? input.text : input.choice_id }, turn.assistant_message],
        }
        setSnapshot(next)
        onWorkspaceUpdated(next, rawScriptIfAny)
        // 后端 workspace_patch 可能改变了 artifacts，重新拉一次快照确保节点数据是最新的
        void fetchWorkspace(projectId).then((fresh) => {
          if (fresh) {
            setSnapshot(fresh)
            onWorkspaceUpdated(fresh)
          }
        })
      }
      setText('')
    } catch {
      antMessage.error('提交失败，正在重新同步当前进度')
      void load()
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="nw-agent-panel">
      <div className="nw-agent-panel-head">
        <span>{config.label} · 引导</span>
        {snapshot?.stage && <span className="nw-agent-stage-tag">{snapshot.stage}</span>}
      </div>

      <div className="nw-agent-messages" ref={scrollRef}>
        {loading && <Spin />}
        {snapshot?.messages?.map((m, i) => (
          <div key={i} className={`nw-agent-msg nw-agent-msg-${m.role}`}>
            {m.content}
          </div>
        ))}
        {!loading && !snapshot?.messages?.length && (
          <div className="nw-agent-hint">
            {canvasType === 'ecommerce'
              ? '电商 workflow 目前复用短剧 agent 后端对话（后端还没有专门的电商对话流程），这里可以自由提问，但不会自动帮你建商品节点 —— 请直接双击画布或右键新建「商品节点」，完成上传原图 → 白底产品设定图 → 多角度扩展。'
              : '在下方贴入剧本原文开始（例：婚礼当天，新郎逃婚……），agent 会解析故事构成 / 角色 / 分镜信息。'}
          </div>
        )}
      </div>

      {snapshot?.question_card && (
        <div className="nw-agent-question">
          <div className="nw-agent-question-text">{snapshot.question_card.question}</div>
          <div className="nw-agent-options">
            {snapshot.question_card.options?.map((opt) => (
              <button key={opt.id} className="nw-btn nw-btn-secondary" disabled={submitting} onClick={() => send({ type: 'choice', choice_id: opt.id })}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="nw-agent-input-row">
        <textarea
          className="nw-agent-input"
          placeholder="贴剧本 / 补充信息 / 自由回复（不改也可以直接用灰字默认值）"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && text.trim()) {
              void send({ type: 'text', text })
            }
          }}
        />
        <button
          className="nw-btn"
          disabled={submitting || !text.trim()}
          onClick={() => text.trim() && send({ type: 'text', text })}
        >
          <SendOutlined />
        </button>
      </div>
    </div>
  )
}
