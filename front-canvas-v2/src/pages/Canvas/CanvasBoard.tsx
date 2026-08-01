import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
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
import { RainbowConnectionLine } from '../../components/edges/ConnectionLine'
import { AddNodeMenu } from '../../components/nodes/AddNodeMenu'
import { GenerationDock } from '../../components/nodes/GenerationDock'
import { useUiStore } from '../../state/uiStore'
import { useCanvasPersistence } from './hooks/useCanvasPersistence'
import { useNodeOperations, nodeWidthOf } from './hooks/useNodeOperations'
import { useCanvasFlow } from './CanvasFlowContext'
import { uploadMaterial } from '../../services/materialUpload'
import { useProjectSettings } from '../../state/projectContext'
import type { NodeKind } from '../../types/canvas'

interface CanvasBoardProps {
  projectId: string
}

/** ReactFlow 容器：视口/连线/右键菜单/自动布局落位。§1 的性能与无频闪要求全部在这里落地。
 *  §1.1 小地图已删除；§2 连线交互（拉线落空白弹菜单 / 落节点关联 / 双击剪线）在这里。
 *  连线不再做类型硬规则（画布类型已删除），任意节点可互连、可被多节点关联（§2.2）。 */
export function CanvasBoard({ projectId }: CanvasBoardProps) {
  const { nodes, edges, setNodes, setEdges } = useCanvasFlow()
  const [menu, setMenu] = useState<{ x: number; y: number; flowX: number; flowY: number; connectFromId?: string } | null>(null)
  const setSelectedNodeId = useUiStore((s) => s.setSelectedNodeId)
  const activeDialogNodeId = useUiStore((s) => s.activeDialogNodeId)
  const setActiveDialogNodeId = useUiStore((s) => s.setActiveDialogNodeId)
  const railAddMenu = useUiStore((s) => s.railAddMenu)
  const setRailAddMenu = useUiStore((s) => s.setRailAddMenu)
  const connectingRef = useRef<{ nodeId: string | null }>({ nodeId: null })
  const rfWrapper = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { screenToFlowPosition, getViewport } = useReactFlow()
  const { project } = useProjectSettings()

  const { loaded, requestSave } = useCanvasPersistence(projectId)
  const { createNode, patchNodeData } = useNodeOperations()

  const onNodesChange = useCallback((changes: NodeChange[]) => setNodes((prev) => applyNodeChanges(changes, prev)), [setNodes])

  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      patchNodeData(node.id, { pinned: true })
      requestSave()
    },
    [patchNodeData, requestSave],
  )

  // §2.2：任意节点可互连、可被多节点关联，不再做类型硬规则拦截
  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((prev) => addEdge({ ...connection, type: 'rainbow' }, prev))
      requestSave()
    },
    [setEdges, requestSave],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((prev) => applyEdgeChanges(changes, prev))
      if (changes.some((c) => c.type === 'remove')) requestSave()
    },
    [setEdges, requestSave],
  )

  // §2.3 双击连线剪断
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

  // §2.2 拉线落空白 → 弹添加节点菜单并自动连线（落到已有节点加号由 onConnect 处理）
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

  // 左栏白色加号点击 → 在画布中心偏上位置弹添加节点菜单
  useEffect(() => {
    if (!railAddMenu) return
    const bounds = rfWrapper.current?.getBoundingClientRect()
    const cx = (bounds?.left ?? 0) + (bounds?.width ?? window.innerWidth) / 2
    const cy = (bounds?.top ?? 0) + 160
    const flowPos = screenToFlowPosition({ x: cx, y: cy })
    setMenu({ x: railAddMenu.x, y: railAddMenu.y, flowX: flowPos.x, flowY: flowPos.y })
    setRailAddMenu(null)
  }, [railAddMenu, screenToFlowPosition, setRailAddMenu])

  const triggerUpload = useCallback(
    (flowX: number, flowY: number, connectFromId?: string) => {
      const input = fileInputRef.current
      if (!input) return
      input.onchange = async () => {
        const file = input.files?.[0]
        input.value = ''
        if (!file) return
        const id = createNode('material', { x: flowX - 170, y: flowY - 40 }, {
          title: file.name,
          status: 'loading',
          media_kind: file.type.startsWith('video') ? 'video' : 'image',
          local_url: URL.createObjectURL(file),
        })
        if (connectFromId) setEdges((prev) => addEdge({ id: `edge_${connectFromId}_${id}`, source: connectFromId, target: id, type: 'rainbow' }, prev))
        const res = await uploadMaterial(file, project?.id)
        if (res.error) {
          patchNodeData(id, { status: 'error', error: res.error })
        } else {
          patchNodeData(id, { status: 'ready', file_id: res.fileId, url: res.url })
          requestSave()
        }
      }
      input.click()
    },
    [createNode, setEdges, patchNodeData, requestSave, project?.id],
  )

  const handlePickNode = useCallback(
    (kind: string) => {
      if (!menu) return
      if (kind === 'upload') {
        triggerUpload(menu.flowX, menu.flowY, menu.connectFromId)
        setMenu(null)
        return
      }
      const width = nodeWidthOf(kind as NodeKind)
      const id = createNode(kind as NodeKind, { x: menu.flowX - width / 2, y: menu.flowY - 40 }, { title: '' })
      if (menu.connectFromId) {
        setEdges((prev) => addEdge({ id: `edge_${menu.connectFromId}_${id}`, source: menu.connectFromId!, target: id, type: 'rainbow' }, prev))
      }
      requestSave()
      setMenu(null)
    },
    [menu, createNode, setEdges, requestSave, triggerUpload],
  )

  const onSelectionChange = useCallback(
    ({ nodes: sel }: { nodes: Node[] }) => {
      setSelectedNodeId(sel[0]?.id ?? null)
    },
    [setSelectedNodeId],
  )

  const activeDialogNode = nodes.find((n) => n.id === activeDialogNodeId)
  void getViewport

  return (
    <div className="nw-canvas-wrapper" ref={rfWrapper} style={{ width: '100%', height: '100%' }} onDoubleClick={onPaneDoubleClick}>
      <input ref={fileInputRef} type="file" accept="image/*,video/*" style={{ display: 'none' }} />
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
        connectionLineComponent={RainbowConnectionLine}
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
        <Controls position="bottom-right" showInteractive={false} />
      </ReactFlow>

      {menu && (
        <AddNodeMenu
          x={menu.x}
          y={menu.y}
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
            message.info('通用生成节点需要连接到工作流的具体节点（角色/场景/道具/关键帧/视频/商品）或用预设工作流铺开，才会真正调用后端，这是已在交付说明中列出的边界。')
            setActiveDialogNodeId(null)
          }}
        />
      )}
    </div>
  )
}
