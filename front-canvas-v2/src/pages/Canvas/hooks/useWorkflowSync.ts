import { useCallback, useRef } from 'react'
import type { Node } from '@xyflow/react'
import { StudioProjectsService } from '../../../services/generated'
import type { AgentWorkspaceSnapshotRead } from '../../../services/generated'
import { findStoryboardPage } from '../../../services/workflowArtifacts'
import { useCanvasFlow } from '../CanvasFlowContext'
import { computeNextPosition } from './useAutoLayout'
import { nodeWidthOf } from './useNodeOperations'

/**
 * 把 agent workspace 快照 + 资产库同步成画布节点（script/character/location/prop/
 * storyboard/shot_group/shotlist_text）。这些节点全部是"已有后端数据的只读投影"：
 * 生成与重渲的决策都发生在 agent 对话里（见 agentClient.ts 顶部注释），本 hook 只负责
 * "把结果摆上画布"，不会自己发起生成请求。
 *
 * 全部通过单次函数式 setNodes 完成"存在则更新/不存在则插入"，避免连续多次 ensureNode
 * 调用互相踩到对方刚插入的节点（不依赖闭包里的 nodes 快照）。
 */
export function useWorkflowSync(projectId: string) {
  const { setNodes, setEdges } = useCanvasFlow()
  const scriptEnsuredRef = useRef(false)

  const ensureNode = useCallback(
    (kind: string, matchId: string, buildData: (existing?: Node) => Record<string, unknown>, connectFrom?: string) => {
      const id = `${kind}_${matchId}`
      setNodes((prev) => {
        const idx = prev.findIndex((n) => n.id === id)
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = { ...next[idx], data: { ...next[idx].data, ...buildData(next[idx]) } }
          return next
        }
        const position = computeNextPosition(kind as never, prev)
        const node: Node = {
          id,
          type: kind,
          position,
          data: { kind, entity_id: matchId, status: 'ready', created_at: new Date().toISOString(), ...buildData() },
        }
        return [...prev, node]
      })
      if (connectFrom) {
        const edgeId = `edge_${connectFrom}_${id}`
        setEdges((prev) => (prev.some((e) => e.id === edgeId) ? prev : [...prev, { id: edgeId, source: connectFrom, target: id, type: 'rainbow' }]))
      }
      return id
    },
    [setNodes, setEdges],
  )

  const syncFromWorkspace = useCallback(
    async (snapshot: AgentWorkspaceSnapshotRead, rawScriptText?: string) => {
      let scriptNodeId: string | undefined
      if (rawScriptText || snapshot.messages?.length || scriptEnsuredRef.current) {
        scriptEnsuredRef.current = true
        scriptNodeId = ensureNode('script', 'main', (existing) => ({
          title: '剧本',
          raw_script: rawScriptText ?? (existing?.data as { raw_script?: string })?.raw_script ?? '',
          stage: snapshot.stage,
          messages: snapshot.messages ?? [],
          artifacts: snapshot.artifacts ?? {},
        }))
      }

      try {
        const libRes = await StudioProjectsService.getProjectAssetLibraryApiV1StudioProjectsProjectIdAssetLibraryGet({ projectId })
        const lib = libRes.data
        if (lib) {
          lib.characters?.forEach((c) => {
            ensureNode(
              'character',
              c.id,
              () => ({ title: `角色资产 · ${c.name}`, name: c.name, bible_json: c.bible ?? {}, reference_images: c.reference_images ?? [], relations: c.relations ?? [] }),
              scriptNodeId,
            )
          })
          lib.scenes?.forEach((s) => {
            ensureNode('location', s.id, () => ({ title: `场景 · ${s.name}`, name: s.name, reference_images: s.reference_images ?? [] }), scriptNodeId)
          })
          lib.props?.forEach((p) => {
            ensureNode('prop', p.id, () => ({ title: `道具 · ${p.name}`, name: p.name, reference_images: p.reference_images ?? [] }), scriptNodeId)
          })
        }
      } catch {
        // 资产库暂不可读时静默跳过，不影响其余节点同步
      }

      const page = findStoryboardPage(snapshot.artifacts)
      if (page) {
        const storyboardId = ensureNode('storyboard', page.chapter_id, () => ({ title: '手绘故事板', page }), scriptNodeId)
        ensureNode('shot_group', page.chapter_id, () => ({ title: '镜头分组', page }), storyboardId)
        ensureNode('shotlist_text', page.chapter_id, () => ({ title: '分镜表（文字版）', page }), storyboardId)
      }
    },
    [ensureNode, projectId],
  )

  return { syncFromWorkspace, nodeWidthOf }
}
