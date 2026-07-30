import { useCallback, useMemo } from 'react'
import type { Edge, Node, ReactFlowInstance } from '@xyflow/react'
import type { NuwaCanvasNodeData } from '../types'

function newId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}_${crypto.randomUUID()}`
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

/** useNodeOperations 集中处理复制、删除、派生新节点和聚焦，避免系统覆盖旧结果。 */
export function useNodeOperations({
  flow,
  nodes,
  edges,
  setNodes,
  setEdges,
}: {
  flow: ReactFlowInstance<Node<NuwaCanvasNodeData>, Edge>
  nodes: Node<NuwaCanvasNodeData>[]
  edges: Edge[]
  setNodes: (updater: (current: Node<NuwaCanvasNodeData>[]) => Node<NuwaCanvasNodeData>[]) => void
  setEdges: (updater: (current: Edge[]) => Edge[]) => void
}) {
  const copyNode = useCallback((node: Node<NuwaCanvasNodeData>) => {
    setNodes((current) => [
      ...current,
      {
        ...node,
        id: newId(`copy_${node.type || 'node'}`),
        selected: false,
        position: { x: node.position.x + 60, y: node.position.y + 40 },
        data: { ...node.data, derived_from: node.id, created_at: new Date().toISOString() },
      },
    ])
  }, [setNodes])

  const deriveNode = useCallback((node: Node<NuwaCanvasNodeData>, patch: Partial<NuwaCanvasNodeData> = {}) => {
    const id = newId(`derived_${node.type || 'node'}`)
    const next: Node<NuwaCanvasNodeData> = {
      ...node,
      id,
      selected: false,
      position: { x: node.position.x + 60, y: node.position.y + 40 },
      data: { ...node.data, ...patch, derived_from: node.id, created_at: new Date().toISOString() },
    }
    setNodes((current) => [...current, next])
    setEdges((current) => [
      ...current,
      { id: `${node.id}->${id}`, source: node.id, target: id, type: 'default', animated: false, style: { strokeDasharray: '6 6' } },
    ])
  }, [setEdges, setNodes])

  const deleteNode = useCallback((nodeId: string) => {
    setNodes((current) => current.filter((node) => node.id !== nodeId))
    setEdges((current) => current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId))
  }, [setEdges, setNodes])

  const focusNode = useCallback((nodeId: string) => {
    const node = nodes.find((item) => item.id === nodeId)
    if (!node) return
    void flow.setCenter(node.position.x + 160, node.position.y + 120, { zoom: Math.max(flow.getZoom(), 0.85), duration: 500 })
  }, [flow, nodes])

  return useMemo(() => ({
    copy: copyNode,
    derive: deriveNode,
    delete: deleteNode,
    focus: focusNode,
    copyNode,
    deriveNode,
    deleteNode,
    focusNode,
    edges,
  }), [copyNode, deleteNode, deriveNode, edges, focusNode])
}
