import { getIncomers, type Edge, type Node } from '@xyflow/react'
import type { NuwaCanvasNodeData } from '../types'

/** useUpstream 读取 React Flow 上游节点，生成前用于校验依赖是否齐全。 */
export function useUpstream(nodes: Node<NuwaCanvasNodeData>[], edges: Edge[]) {
  const getUpstream = (node: Node<NuwaCanvasNodeData>) => getIncomers(node, nodes, edges)

  const requireUpstream = (node: Node<NuwaCanvasNodeData>, types: string[]) => {
    const upstream = getUpstream(node)
    const missing = types.filter((type) => !upstream.some((item) => item.type === type))
    return { upstream, missing }
  }

  return { getUpstream, requireUpstream }
}
