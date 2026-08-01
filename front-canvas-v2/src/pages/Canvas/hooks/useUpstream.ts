import { useCallback } from 'react'
import { getIncomers, type Node } from '@xyflow/react'
import { useCanvasFlow } from '../CanvasFlowContext'

/** 取上游节点数据（对应 Tersa 的 getIncomers 用法）。上游缺必要输入时不静默失败，交给调用方判断。 */
export function useUpstream() {
  const { nodes, edges } = useCanvasFlow()

  const upstreamOf = useCallback(
    (nodeId: string): Node[] => {
      const self = nodes.find((n) => n.id === nodeId)
      if (!self) return []
      return getIncomers(self, nodes, edges)
    },
    [nodes, edges],
  )

  const upstreamOfKind = useCallback(
    (nodeId: string, kind: string) => upstreamOf(nodeId).filter((n) => n.type === kind),
    [upstreamOf],
  )

  return { upstreamOf, upstreamOfKind }
}
