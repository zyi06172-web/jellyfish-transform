import { useCallback, useEffect, useRef, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { CanvasStateService } from '../../../services/canvasState'
import { useCanvasFlow } from '../CanvasFlowContext'

/**
 * 画布状态保存 —— 必须做对，否则重演旧版右下频闪死循环。
 *
 * 根因（计划书 §1.2）：`useEffect(() => save(nodes,edges), [nodes,edges])` 会让
 * "保存触发 setState → setState 触发保存" 无限循环。
 *
 * 正确写法：
 * 1. 保存只在明确的用户操作结束点触发（onNodeDragStop / onConnect / onEdgesDelete /
 *    节点内容提交后），由调用方显式喊 `requestSave()`，不存在监听 nodes/edges 的裸 effect。
 * 2. `requestSave` 内部只读 context 里的 nodes/edges（当次调用时的最新值）与
 *    `getViewport()`（命令式取值），保存函数本身绝不调用任何会改变 nodes/edges 的 setState。
 * 3. 防抖 900ms，多次触发合并为一次网络请求。
 */
export function useCanvasPersistence(projectId: string | undefined) {
  const { getViewport, setViewport } = useReactFlow()
  const { nodes, edges, setNodes, setEdges } = useCanvasFlow()
  const [loaded, setLoaded] = useState(false)
  const timerRef = useRef<number | null>(null)
  const savingRef = useRef(false)
  const latestRef = useRef({ nodes, edges })
  latestRef.current = { nodes, edges }

  useEffect(() => {
    if (!projectId) return
    let alive = true
    CanvasStateService.get(projectId)
      .then((res) => {
        if (!alive) return
        const state = res.data
        if (state?.nodes?.length) setNodes(state.nodes as never)
        if (state?.edges?.length) setEdges(state.edges as never)
        if (state?.viewport) setViewport(state.viewport)
      })
      .catch(() => void 0)
      .finally(() => alive && setLoaded(true))
    return () => {
      alive = false
    }
    // 只在项目切换时加载一次，不依赖 nodes/edges，避免任何裸 effect 保存循环
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const flushSave = useCallback(() => {
    if (!projectId || savingRef.current) return
    savingRef.current = true
    const payload = {
      nodes: latestRef.current.nodes as unknown as Record<string, unknown>[],
      edges: latestRef.current.edges as unknown as Record<string, unknown>[],
      viewport: getViewport(),
    }
    CanvasStateService.update(projectId, payload)
      .catch(() => void 0)
      .finally(() => {
        savingRef.current = false
      })
  }, [projectId, getViewport])

  const requestSave = useCallback(
    (debounceMs = 900) => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(flushSave, debounceMs)
    },
    [flushSave],
  )

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [])

  return { loaded, requestSave, flushSaveNow: flushSave }
}
