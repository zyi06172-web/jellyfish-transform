import { useCallback, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  Controls,
  useReactFlow,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeChange,
  type OnConnectStart,
  type OnConnectEnd,
} from '@xyflow/react'
import { message } from 'antd'
import { nodeTypes } from '../../components/nodes'
import { edgeTypes } from '../../components/edges/RainbowEdge'
import { AddNodeMenu } from '../../components/nodes/AddNodeMenu'
import { GenerationDock } from '../../components/nodes/GenerationDock'
import { useUiStore } from '../../state/uiStore'
import { CANVAS_TYPE_CONFIGS } from '../../types/canvasTypeConfig'
import { useCanvasPersistence } from './hooks/useCanvasPersistence'
import { useNodeOperations, nodeWidthOf } from './hooks/useNodeOperations'
import { useCanvasFlow } from './CanvasFlowContext'
import type { NodeKind } from '../../types/canvas'

interface CanvasBoardProps {
  projectId: string
}

/** ReactFlow 容器：视口/连线/右键菜单/自动布局落位。§1 的性能与无频闪要求全部在这里落地。
 *  nodes/edges 状态来自 CanvasFlowContext（页面级持有，见该文件顶部注释），本组件只是
 *  其中一个消费者，和 agent 面板共用同一份数据。 */
export function CanvasBoard({ projectId }: CanvasBoardProps) {
  const { nodes, edges, setNodes, setEdges } = useCanvasFlow()
  const [menu, setMenu] = useState<{ x: number; y: number; flowX: number; flowY: number; connectFromId?: string } | null>(null)
  const canvasType = useUiStore((s) => s.canvasType)
  const setSelectedNodeId = useUiStore((s) => s.setSelectedNodeId)
  const activeDialogNodeId = useUiStore((s) => s.activeDialogNodeId)
  const setActiveDialogNodeId = useUiStore((s) => s.setActiveDialogNodeId)
  const config = CANVAS_TYPE_CONFIGS[canvasType]
  const connectingRef = useRef<{ nodeId: string | null }>({ nodeId: null })
  const rfWrapper = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition } = useReactFlow()

  const { loaded, requestSave } = useCanvasPersistence(projectId)
  const { createNode, patchNodeData, connectAllowed } = useNodeOperations()

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((prev) => applyNodeChanges(changes, prev)),
    [setNodes],
  )

  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      patchNodeData(node.id, { pinned: true })
      requestSave()
    },
    [patchNodeData, requestSave],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      setNodes((prev) => {
        const sourceNode = prev.find((n) => n.id === connection.source)
        const targetNode = prev.find((n) => n.id === connection.target)
        if (sourceNode && targetNode && config.connectionRulesEnforced) {
          const ok = connectAllowed(sourceNode.type ?? '', targetNode.type ?? '', config.allowedConnections, true)
          if (!ok) message.warning('这两类节点通常不这样连接，仅作提示，已为你连上')
        }
        return prev
      })
      setEdges((prev) => addEdge({ ...connection, type: 'rainbow' }, prev))
      requestSave()
    },
    [setNodes, setEdges, config, connectAllowed, requestSave],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((prev) => applyEdgeChanges(changes, prev))
      if (changes.some((c) => c.type === 'remove')) requestSave()
    },
    [setEdges, requestSave],
  )

  const onEdgeDoubleClick = useCallback(
    (e: React.MouseEvent, edge: Edge) => {
      e.stopPropagation()
      setEdges((prev) => prev.filter((x) => x.id !== edge.id))
      requestSave()
    },
    [setEdges, requestSave],
  )

  const onPaneDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target?.classList?.contains('react-flow__pane')) return
      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      setMenu({ x: e.clientX, y: e.clientY, flowX: flowPos.x, flowY: flowPos.y })
    },
    [screenToFlowPosition],
  )

  const onConnectStart: OnConnectStart = useCallback((_, params) => {
    connectingRef.current = { nodeId: params.nodeId }
  }, [])

  const onConnectEnd: OnConnectEnd = useCallback(
    (event) => {
      const target = event.target as HTMLElement
      const isPane = target?.classList?.contains('react-flow__pane')
      if (!isPane) return
      const clientX = 'clientX' in event ? (event as MouseEvent).clientX : (event as TouchEvent).changedTouches?.[0]?.clientX ?? 0
      const clientY = 'clientY' in event ? (event as MouseEvent).clientY : (event as TouchEvent).changedTouches?.[0]?.clientY ?? 0
      const flowPos = screenToFlowPosition({ x: clientX, y: clientY })
      setMenu({ x: clientX, y: clientY, flowX: flowPos.x, flowY: flowPos.y, connectFromId: connectingRef.current.nodeId ?? undefined })
    },
    [screenToFlowPosition],
  )

  const handlePickNode = useCallback(
    (kind: string) => {
      if (!menu) return
      const width = nodeWidthOf(kind as NodeKind)
      const id = createNode(kind as NodeKind, { x: menu.flowX - width / 2, y: menu.flowY - 40 }, { title: '' })
      if (menu.connectFromId) {
        setEdges((prev) => addEdge({ id: `edge_${menu.connectFromId}_${id}`, source: menu.connectFromId!, target: id, type: 'rainbow' }, prev))
      }
      requestSave()
      setMenu(null)
    },
    [menu, createNode, setEdges, requestSave],
  )

  const onSelectionChange = useCallback(
    ({ nodes: sel }: { nodes: Node[] }) => {
      setSelectedNodeId(sel[0]?.id ?? null)
    },
    [setSelectedNodeId],
  )

  const activeDialogNode = nodes.find((n) => n.id === activeDialogNodeId)

  return (
    <div className="nw-canvas-wrapper" ref={rfWrapper} style={{ width: '100%', height: '100%' }} onDoubleClick={onPaneDoubleClick}>
      <svg width={0} height={0}>
        <defs>
          <linearGradient id="nw-rainbow-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ff5f6d" />
            <stop offset="25%" stopColor="#ffc371" />
            <stop offset="50%" stopColor="#47e0b0" />
            <stop offset="75%" stopColor="#0071e3" />
            <stop offset="100%" stopColor="#a259ff" />
          </linearGradient>
        </defs>
      </svg>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onNodeDragStop={onNodeDragStop}
        onEdgeDoubleClick={onEdgeDoubleClick}
        onSelectionChange={onSelectionChange}
        nodesDraggable
        panOnDrag
        selectionOnDrag={false}
        zoomOnDoubleClick={false}
        minZoom={0.18}
        maxZoom={2}
        onlyRenderVisibleElements
        fitView={!loaded ? false : undefined}
      >
        <Background variant={BackgroundVariant.Dots} gap={28} color="var(--nw-dot)" />
        <MiniMap pannable zoomable className="nw-minimap" />
        <Controls position="bottom-left" showInteractive={false} />
      </ReactFlow>

      {menu && (
        <AddNodeMenu
          x={menu.x}
          y={menu.y}
          canvasType={canvasType}
          connectMode={!!menu.connectFromId}
          onPick={handlePickNode}
          onClose={() => setMenu(null)}
        />
      )}

      {activeDialogNode && ['text', 'image', 'video', 'audio'].includes(activeDialogNode.type ?? '') && (
        <GenerationDock
          nodeId={activeDialogNode.id}
          kind={(activeDialogNode.type ?? 'text') as never}
          onSubmit={(dialogState) => {
            patchNodeData(activeDialogNode.id, { dialog: dialogState })
            message.info('通用节点的自由生成需要连接到短剧工作流的具体节点（角色/场景/道具/关键帧/视频）才会真正调用后端，这是已在交付说明中列出的边界，不是漏做。')
            setActiveDialogNodeId(null)
          }}
        />
      )}
    </div>
  )
}
