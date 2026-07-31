import { StudioProjectsService } from './generated'
import type { AgentTurnRead, AgentWorkspaceSnapshotRead } from './generated'

/**
 * 短剧 workflow 的 agent 对话（业务附件 §0/§7）走同一条真实后端链路：
 * GET  /projects/{id}/workspace       —— 读快照（stage/question_card/messages/artifacts）
 * POST /projects/{id}/agent/turns     —— 提交一次问答 turn
 *
 * 人物/场景/道具的生成与"重渲"决策都在后端 agent 状态机内部完成（见
 * backend/app/services/studio/agent/element_regeneration.py 只在 agent turn
 * 内部被调用，没有独立 REST 入口）——因此本文件是画布唯一与 agent 对话的出口，
 * 节点上的"重渲"类按钮最终都会落到这里的 submitTurn。
 */

function sessionKeyFor(projectId: string) {
  return `nuwa.agent.session.${projectId}`
}

export function getOrCreateSessionId(projectId: string): string {
  const key = sessionKeyFor(projectId)
  let sid = localStorage.getItem(key)
  if (!sid) {
    sid = crypto.randomUUID()
    localStorage.setItem(key, sid)
  }
  return sid
}

export async function fetchWorkspace(projectId: string): Promise<AgentWorkspaceSnapshotRead | undefined> {
  const res = await StudioProjectsService.getProjectWorkspaceApiV1StudioProjectsProjectIdWorkspaceGet({ projectId })
  return res.data ?? undefined
}

export async function submitTurn(
  projectId: string,
  input: { type: 'text'; text: string } | { type: 'choice'; choice_id: string },
  expectedRevision: number,
): Promise<AgentTurnRead | undefined> {
  const sessionId = getOrCreateSessionId(projectId)
  const res = await StudioProjectsService.handleProjectAgentTurnApiV1StudioProjectsProjectIdAgentTurnsPost({
    projectId,
    requestBody: {
      session_id: sessionId,
      expected_revision: expectedRevision,
      idempotency_key: crypto.randomUUID(),
      input,
    },
  })
  return res.data ?? undefined
}
