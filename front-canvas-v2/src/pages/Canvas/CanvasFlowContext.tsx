import { createContext, useContext, type Dispatch, type SetStateAction } from 'react'
import type { Node, Edge } from '@xyflow/react'

/**
 * 单一数据源（对应 useCanvasPersistence 顶部注释里强调的同一件事的另一面）：
 * `useNodesState`/`useEdgesState` 本质是普通 `useState`。如果画布节点/连线状态既能从
 * CanvasBoard 内部改，又能从别处通过 `useReactFlow().setNodes()`（内部 store）改，
 * 下一次任何本地 setState 都会用"过期闭包"把 store 刚写入的新数据整个覆盖掉。
 *
 * 所以整棵画布树只允许一份 nodes/edges 状态：由页面级 Canvas/index.tsx 用
 * useNodesState/useEdgesState 持有，通过这个 context 分发给 CanvasBoard、所有节点
 * 组件、以及 agent 相关 hooks，谁都不再直接调用 `useReactFlow().setNodes/getNodes`
 * 来改数据。视口相关的 screenToFlowPosition/getViewport/setViewport/setCenter 不受
 * 影响，可以继续用 useReactFlow()，因为视口不是这里管理的 controlled props。
 *
 * 所有 setNodes/setEdges 调用一律使用函数式更新（prev => next），不要依赖闭包里的
 * `nodes`/`edges` 快照，这样同一批操作里连续调用也不会互相踩掉。
 */
export interface CanvasFlowApi {
  nodes: Node[]
  edges: Edge[]
  setNodes: Dispatch<SetStateAction<Node[]>>
  setEdges: Dispatch<SetStateAction<Edge[]>>
}

export const CanvasFlowContext = createContext<CanvasFlowApi | null>(null)

export function useCanvasFlow(): CanvasFlowApi {
  const ctx = useContext(CanvasFlowContext)
  if (!ctx) throw new Error('useCanvasFlow must be used within CanvasFlowContext.Provider')
  return ctx
}
