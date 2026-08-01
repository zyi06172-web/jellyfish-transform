import { useCallback } from 'react'
import { useReactFlow, type Node } from '@xyflow/react'
import { useCanvasFlow } from '../CanvasFlowContext'
import type { NodeKind } from '../../../types/canvas'

/** agent 自动建节点时的落位算法（业务附件 §7.4）：
 *  script → 资产 → storyboard → shotlist_text → keyframe/shotlist_render → video 从左到右分列，
 *  同类型多个节点在同一列向下排；不重排用户手动拖动过（pinned）的节点。 */
const COLUMN_OF: Partial<Record<NodeKind, number>> = {
  script: 0,
  character: 1,
  location: 1,
  prop: 1,
  storyboard: 2,
  shotlist_text: 3,
  shot_group: 3,
  keyframe: 4,
  shotlist_render: 4,
  video_shot: 5,
  product: 1,
}
const COLUMN_WIDTH = 480
const ROW_HEIGHT = 420

/** 纯函数：给定当前节点数组，算出某类型下一个节点该落在哪。setNodes 的函数式更新里
 *  可以直接传 prev 数组进来，避免读取可能过期的闭包快照。 */
export function computeNextPosition(kind: NodeKind, existingNodes: Node[]) {
  const col = COLUMN_OF[kind] ?? 0
  const sameColumn = existingNodes.filter((n) => (COLUMN_OF[n.type as NodeKind] ?? 0) === col)
  const maxY = sameColumn.reduce((acc, n) => Math.max(acc, n.position.y + (n.measured?.height ?? ROW_HEIGHT)), 0)
  return { x: col * COLUMN_WIDTH + 80, y: maxY > 0 ? maxY + 48 : 80 }
}

export function useAutoLayout() {
  const { nodes } = useCanvasFlow()
  const { setCenter } = useReactFlow()

  const nextPositionFor = useCallback((kind: NodeKind) => computeNextPosition(kind, nodes), [nodes])

  const revealPosition = useCallback(
    (pos: { x: number; y: number }) => {
      setCenter(pos.x + 180, pos.y + 120, { zoom: 0.85, duration: 480 })
    },
    [setCenter],
  )

  return { nextPositionFor, revealPosition }
}
