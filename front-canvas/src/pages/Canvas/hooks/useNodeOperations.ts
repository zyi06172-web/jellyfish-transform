import { useCallback } from 'react'
import { useReactFlow, type Node, type Edge } from '@xyflow/react'
import { useCanvasFlow } from '../CanvasFlowContext'
import type { BaseNodeData, NodeKind } from '../../../types/canvas'

let seq = 0
function genId(prefix: string) {
  seq += 1
  return `${prefix}_${Date.now().toString(36)}_${seq}`
}

const NODE_WIDTH: Record<NodeKind, number> = {
  text: 360,
  image: 360,
  video: 440,
  audio: 360,
  script: 420,
  character: 460,
  location: 380,
  prop: 320,
  storyboard: 780,
  shot_group: 620,
  keyframe: 640,
  shotlist_text: 720,
  shotlist_render: 980,
  video_shot: 440,
  product: 380,
}

export function nodeWidthOf(kind: NodeKind) {
  return NODE_WIDTH[kind] ?? 360
}

/** 建节点 / 复制 / 聚焦 / 删除 / 在右侧派生新节点（原则2：再生成永远开新节点）。
 *  全部走函数式 setNodes/setEdges，不依赖闭包里的 nodes/edges 快照。 */
export function useNodeOperations() {
  const { setNodes, setEdges, nodes } = useCanvasFlow()
  const { setCenter } = useReactFlow()

  const createNode = useCallback(
    (kind: NodeKind, position: { x: number; y: number }, extraData: Record<string, unknown> = {}) => {
      const id = genId(kind)
      const data: BaseNodeData = {
        kind,
        title: extraData.title as string,
        status: 'empty',
        created_at: new Date().toISOString(),
        dialog: {},
        ...extraData,
      }
      const node: Node = { id, type: kind, position, data: data as unknown as Record<string, unknown>, selected: true }
      setNodes((prev) => [...prev.map((n) => ({ ...n, selected: false })), node])
      return id
    },
    [setNodes],
  )

  /** 重渲/重出：旧节点原地保留，新结果在右下方偏移生成，虚线连回来源（原则2 + §7.4） */
  const deriveNode = useCallback(
    (sourceId: string, kind: NodeKind, extraData: Record<string, unknown> = {}) => {
      const id = genId(kind)
      setNodes((prev) => {
        const source = prev.find((n) => n.id === sourceId)
        if (!source) return prev
        const position = { x: source.position.x + 60, y: source.position.y + (source.measured?.height ?? 200) + 40 }
        const data: BaseNodeData = {
          kind,
          title: extraData.title as string,
          status: 'empty',
          created_at: new Date().toISOString(),
          derived_from: sourceId,
          dialog: {},
          ...extraData,
        }
        const node: Node = { id, type: kind, position, data: data as unknown as Record<string, unknown>, selected: true }
        return [...prev.map((n) => ({ ...n, selected: false })), node]
      })
      const edge: Edge = { id: genId('edge'), source: sourceId, target: id, type: 'rainbow', data: { derived: true } }
      setEdges((prev) => [...prev, edge])
      return id
    },
    [setNodes, setEdges],
  )

  const patchNodeData = useCallback(
    (id: string, patch: Record<string, unknown>) => {
      setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)))
    },
    [setNodes],
  )

  const focusNode = useCallback(
    (id: string) => {
      const node = nodes.find((n) => n.id === id)
      if (!node) return
      const w = node.measured?.width ?? 360
      const h = node.measured?.height ?? 200
      setCenter(node.position.x + w / 2, node.position.y + h / 2, { zoom: 0.9, duration: 500 })
    },
    [nodes, setCenter],
  )

  const connectAllowed = useCallback(
    (sourceKind: string, targetKind: string, allowed: ReadonlyArray<readonly [string, string]>, enforced: boolean) => {
      if (!enforced || allowed.length === 0) return true
      return allowed.some(([a, b]) => a === sourceKind && b === targetKind)
    },
    [],
  )

  return { createNode, deriveNode, patchNodeData, focusNode, connectAllowed }
}
