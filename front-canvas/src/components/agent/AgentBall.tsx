import { useCallback, useEffect, useRef, useState } from 'react'
import { message as antMessage } from 'antd'
import { SendOutlined } from '@ant-design/icons'
import { useUiStore } from '../../state/uiStore'
import { fetchWorkspace, submitTurn } from '../../services/agentClient'
import type { AgentWorkspaceSnapshotRead } from '../../services/generated'
import './agentBall.css'

const DRAG_THRESHOLD = 5

/** 形态一 · 中下小球（自由创作场景，计划书 §7.1）。
 *  点击 vs 拖拽通过 5px 位移阈值区分；拖拽时立即收起对话框；
 *  再次点击时若已被拖走，先归位再展开。 */
export function AgentBall({ projectId }: { projectId: string }) {
  const ballPos = useUiStore((s) => s.ballPos)
  const setBallPos = useUiStore((s) => s.setBallPos)
  const [expanded, setExpanded] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [returning, setReturning] = useState(false)
  const dragStart = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const [snapshot, setSnapshot] = useState<AgentWorkspaceSnapshotRead | null>(null)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const anchor = { x: window.innerWidth / 2 - 32, y: window.innerHeight - 180 }
  const pos = ballPos ?? anchor
  const isAtAnchor = !ballPos

  const onPointerDown = (e: React.PointerEvent) => {
    dragStart.current = { x: e.clientX, y: e.clientY, moved: false }
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragStart.current) return
    const dx = e.clientX - dragStart.current.x
    const dy = e.clientY - dragStart.current.y
    if (Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      if (!dragStart.current.moved) {
        dragStart.current.moved = true
        setDragging(true)
        setExpanded(false)
      }
      setBallPos({ x: pos.x + dx, y: pos.y + dy })
      dragStart.current = { x: e.clientX, y: e.clientY, moved: true }
    }
  }

  const onPointerUp = () => {
    const moved = dragStart.current?.moved
    dragStart.current = null
    setDragging(false)
    if (!moved) {
      onClickBall()
    }
  }

  const onClickBall = useCallback(() => {
    if (!isAtAnchor) {
      setReturning(true)
      setBallPos(null)
      window.setTimeout(() => {
        setReturning(false)
        setExpanded(true)
      }, 320)
    } else {
      setExpanded((v) => !v)
    }
  }, [isAtAnchor, setBallPos])

  useEffect(() => {
    if (expanded && !snapshot) {
      void fetchWorkspace(projectId)
        .then((s) => s && setSnapshot(s))
        .catch(() => void 0)
    }
  }, [expanded, projectId, snapshot])

  const send = async () => {
    if (!snapshot || !text.trim()) return
    setSubmitting(true)
    try {
      const turn = await submitTurn(projectId, { type: 'text', text }, snapshot.revision)
      if (turn) {
        setSnapshot({
          ...snapshot,
          revision: turn.revision,
          stage: turn.stage,
          question_card: turn.question_card ?? null,
          messages: [...(snapshot.messages ?? []), { role: 'user', kind: 'text', content: text }, turn.assistant_message],
        })
      }
      setText('')
    } catch {
      antMessage.error('对话失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="nw-ball-layer">
      <div
        className={`nw-ball ${dragging ? 'dragging' : ''} ${returning ? 'returning' : ''}`}
        style={{ left: pos.x, top: pos.y }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        女娲
      </div>
      {expanded && !dragging && (
        <div className="nw-ball-dialog" style={{ left: pos.x + 76, top: pos.y - 40 }}>
          <div className="nw-ball-dialog-head">随手问女娲</div>
          <div className="nw-ball-dialog-body">
            {snapshot?.messages?.slice(-4).map((m, i) => (
              <div key={i} className={`nw-agent-msg nw-agent-msg-${m.role}`}>
                {m.content}
              </div>
            ))}
            {!snapshot?.messages?.length && <div className="nw-agent-hint">随时可以问我怎么做，或者让我帮你生成点什么。</div>}
          </div>
          <div className="nw-ball-dialog-input">
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="说点什么…" onKeyDown={(e) => e.key === 'Enter' && send()} />
            <button className="nw-icon-btn" disabled={submitting} onClick={send}>
              <SendOutlined />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
