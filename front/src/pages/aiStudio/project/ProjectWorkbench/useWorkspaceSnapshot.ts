import { useCallback, useEffect, useMemo, useState } from 'react'
import { StudioProjectsService, type AgentTurnInputRead, type AgentWorkspaceSnapshotRead } from '../../../../services/generated'

function createTurnIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `agent_turn_${crypto.randomUUID()}`
  }
  return `agent_turn_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export function useWorkspaceSnapshot(projectId?: string) {
  const [snapshot, setSnapshot] = useState<AgentWorkspaceSnapshotRead | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      const res = await StudioProjectsService.getProjectWorkspaceApiV1StudioProjectsProjectIdWorkspaceGet({ projectId })
      setSnapshot(res.data ?? null)
    } catch {
      setError('工作台快照加载失败')
      setSnapshot(null)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const submitTurn = useCallback(
    async (input: AgentTurnInputRead) => {
      if (!projectId || !snapshot?.session_id) return null
      setSubmitting(true)
      setError(null)
      try {
        const res = await StudioProjectsService.handleProjectAgentTurnApiV1StudioProjectsProjectIdAgentTurnsPost({
          projectId,
          requestBody: {
            session_id: snapshot.session_id,
            expected_revision: snapshot.revision,
            idempotency_key: createTurnIdempotencyKey(),
            input,
          },
        })
        await refresh()
        return res.data ?? null
      } catch {
        setError('Agent 对话提交失败，请刷新后重试')
        await refresh()
        return null
      } finally {
        setSubmitting(false)
      }
    },
    [projectId, refresh, snapshot?.revision, snapshot?.session_id],
  )

  return useMemo(
    () => ({ snapshot, loading, submitting, error, refresh, submitTurn }),
    [error, loading, refresh, snapshot, submitTurn, submitting],
  )
}
