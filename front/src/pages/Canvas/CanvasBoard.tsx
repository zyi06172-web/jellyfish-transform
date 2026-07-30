import '@xyflow/react/dist/style.css'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type Viewport,
} from '@xyflow/react'
import { Alert, Modal, Spin, message } from 'antd'
import {
  StudioChaptersService,
  StudioProjectsService,
  type AgentWorkspaceSnapshotRead,
  type ProjectAssetLibraryRead,
  type ProjectRead,
} from '../../services/generated'
import { nodeTypes } from '../../components/nodes'
import { AgentDock } from './AgentDock'
import { DEFAULT_CANVAS_RATIO, type NuwaCanvasNodeData } from './types'
import { useAutoLayout } from './hooks/useAutoLayout'
import { useGenerationCost } from './hooks/useGenerationCost'
import { useNodeOperations } from './hooks/useNodeOperations'
import { buildInitialGraph, mergeBackendGraph, persistableNodes, previewRowsFromNodes, savedLooksLikeBatch6 } from './graphBuilder'
import { useCanvasModelStatus } from './hooks/useCanvasModelStatus'
import { ShotlistPreviewModal } from './ShotlistPreviewModal'
import { CanvasToolbar } from './CanvasToolbar'

const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 0.62 }

const ALLOWED_CONNECTIONS = new Set([
  'script->character',
  'script->location',
  'script->prop',
  'script->storyboard',
  'character->storyboard',
  'character->keyframe',
  'location->storyboard',
  'location->keyframe',
  'prop->storyboard',
  'storyboard->shot_group',
  'storyboard->shotlist_text',
  'shot_group->keyframe',
  'shotlist_text->keyframe',
  'keyframe->shotlist_render',
  'shotlist_render->video',
])

function newIdempotencyKey(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}:${crypto.randomUUID()}`
  return `${prefix}:${Date.now()}:${Math.random().toString(16).slice(2)}`
}

/** CanvasBoard 承载 ReactFlow 画布、保存恢复、连线规则和画布内 AgentDock。 */
export function CanvasBoard({
  project,
  projectId,
  chapterId,
  snapshot,
  library,
  agentLoading,
  agentSubmitting,
  agentError,
  onRefresh,
  onChoice,
  onText,
}: {
  project: ProjectRead | null
  projectId: string
  chapterId?: string | null
  snapshot: AgentWorkspaceSnapshotRead | null
  library: ProjectAssetLibraryRead | null
  agentLoading: boolean
  agentSubmitting: boolean
  agentError?: string | null
  onRefresh: () => void
  onChoice: (choiceId: string) => void
  onText: (text: string) => void
}) {
  const flow = useReactFlow<Node<NuwaCanvasNodeData>, Edge>()
  const { positionFor } = useAutoLayout()
  const { estimate } = useGenerationCost()
  const saveTimer = useRef<number | null>(null)
  const [nodes, setNodes] = useState<Node<NuwaCanvasNodeData>[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [agentCollapsed, setAgentCollapsed] = useState(false)
  const [shotlistPreviewOpen, setShotlistPreviewOpen] = useState(false)
  const modelStatus = useCanvasModelStatus()
  const canvasId = chapterId ? `chapter:${chapterId}` : `project:${projectId}`
  const aspectRatio = project?.default_video_ratio || DEFAULT_CANVAS_RATIO
  const operations = useNodeOperations({
    flow,
    nodes,
    edges,
    setNodes,
    setEdges,
  })

  const initialGraph = useMemo(() => buildInitialGraph({
    projectId,
    canvasId,
    aspectRatio,
    library,
    snapshot,
    projectSeed: project?.seed,
    positionFor,
  }), [aspectRatio, canvasId, library, positionFor, project?.seed, projectId, snapshot])

  const saveCanvas = useCallback((nextNodes: Node<NuwaCanvasNodeData>[], nextEdges: Edge[]) => {
    if (!hydrated) return
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      const viewport = flow.getViewport()
      const cleanNodes = persistableNodes(nextNodes)
      if (chapterId) {
        void StudioChaptersService.updateChapterCanvasStateApiV1StudioChaptersChapterIdCanvasStatePatch({
          chapterId,
          requestBody: { nodes: cleanNodes, edges: nextEdges, viewport },
        })
        return
      }
      void StudioProjectsService.updateProjectCanvasStateApiV1StudioProjectsProjectIdCanvasStatePatch({
        projectId,
        requestBody: { nodes: cleanNodes, edges: nextEdges, viewport },
      })
    }, 500)
  }, [chapterId, flow, hydrated, projectId])

  useEffect(() => {
    let cancelled = false
    const hydrate = async () => {
      try {
        const res = chapterId
          ? await StudioChaptersService.getChapterCanvasStateApiV1StudioChaptersChapterIdCanvasStateGet({ chapterId })
          : await StudioProjectsService.getProjectCanvasStateApiV1StudioProjectsProjectIdCanvasStateGet({ projectId })
        const savedNodes = (res.data?.nodes ?? []) as Node<NuwaCanvasNodeData>[]
        const savedEdges = (res.data?.edges ?? []) as Edge[]
        if (cancelled) return
        if (savedLooksLikeBatch6(savedNodes)) {
          const merged = mergeBackendGraph(savedNodes, savedEdges, initialGraph.nodes, initialGraph.edges)
          setNodes(merged.nodes)
          setEdges(merged.edges)
          window.setTimeout(() => flow.setViewport({
            x: res.data?.viewport?.x ?? DEFAULT_VIEWPORT.x,
            y: res.data?.viewport?.y ?? DEFAULT_VIEWPORT.y,
            zoom: res.data?.viewport?.zoom ?? DEFAULT_VIEWPORT.zoom,
          }), 0)
        } else {
          setNodes(initialGraph.nodes)
          setEdges(initialGraph.edges)
          window.setTimeout(() => flow.setViewport(DEFAULT_VIEWPORT), 0)
        }
      } catch {
        if (!cancelled) {
          setNodes(initialGraph.nodes)
          setEdges(initialGraph.edges)
          window.setTimeout(() => flow.setViewport(DEFAULT_VIEWPORT), 0)
        }
      } finally {
        if (!cancelled) setHydrated(true)
      }
    }
    void hydrate()
    return () => { cancelled = true }
  }, [chapterId, flow, initialGraph.edges, initialGraph.nodes, projectId])

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((current) => {
      const movedIds = new Set<string>(
        changes
          .filter((change) => change.type === 'position' && 'dragging' in change && change.dragging === false)
          .map((change) => ('id' in change ? change.id : ''))
          .filter(Boolean),
      )
      const next = (applyNodeChanges(changes, current) as Node<NuwaCanvasNodeData>[]).map((node) => (
        movedIds.has(node.id) ? { ...node, data: { ...node.data, pinned: true } } : node
      ))
      saveCanvas(next, edges)
      return next
    })
  }, [edges, saveCanvas])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((current) => {
      const next = applyEdgeChanges(changes, current)
      saveCanvas(nodes, next)
      return next
    })
  }, [nodes, saveCanvas])

  const onConnect = useCallback((connection: Connection) => {
    const source = nodes.find((node) => node.id === connection.source)
    const target = nodes.find((node) => node.id === connection.target)
    const key = `${source?.type}->${target?.type}`
    if (!ALLOWED_CONNECTIONS.has(key)) {
      message.warning('这两类节点不能相连')
      return
    }
    setEdges((current) => {
      const next = addEdge({ ...connection, animated: true }, current)
      saveCanvas(nodes, next)
      return next
    })
  }, [nodes, saveCanvas])

  useEffect(() => {
    saveCanvas(nodes, edges)
  }, [edges, nodes, saveCanvas])

  const confirmKeyframeRender = useCallback(() => {
    const cost = estimate('keyframe', 5)
    Modal.confirm({
      title: '确认开始渲染关键帧？',
      content: `将使用 ${cost.model} 生成 5 张关键帧，预估费用 ≈¥${cost.cny?.toFixed(2) ?? '0.00'}。确认前不会发起任何生图任务。`,
      okText: '确认，开始渲染',
      cancelText: '取消',
      onOk: async () => {
        if (!snapshot?.session_id) return
        await StudioProjectsService.createProjectCanvasActionApiV1StudioProjectsProjectIdCanvasActionsPost({
          projectId,
          requestBody: {
            session_id: snapshot.session_id,
            action: 'keyframe_render',
            idempotency_key: newIdempotencyKey('canvas:keyframe'),
            confirmed_paid_cost: true,
            model: cost.model,
            item_count: 5,
            estimated_cny: cost.cny,
            payload: { aspect_ratio: aspectRatio, source_node_id: 'shotlist_text' },
          },
        })
        operations.deriveNode(nodes.find((node) => node.id === 'keyframe') ?? nodes[0], {
          status: 'loading',
          title: '关键帧渲染 · 新版本',
          cost,
        })
        await onRefresh()
      },
    })
  }, [aspectRatio, estimate, nodes, onRefresh, operations, projectId, snapshot?.session_id])

  const confirmVideoGeneration = useCallback(() => {
    const cost = estimate('video', 1)
    Modal.confirm({
      title: '确认开始出视频？',
      content: `将使用 ${cost.model} 逐镜头生成视频，单镜头预估 ≈¥${cost.cny?.toFixed(2) ?? '0.00'}。确认前不会发起任何视频任务。`,
      okText: '确认，开始出视频',
      cancelText: '取消',
      onOk: async () => {
        if (!snapshot?.session_id) return
        await StudioProjectsService.createProjectCanvasActionApiV1StudioProjectsProjectIdCanvasActionsPost({
          projectId,
          requestBody: {
            session_id: snapshot.session_id,
            action: 'video_generate',
            idempotency_key: newIdempotencyKey('canvas:video'),
            confirmed_paid_cost: true,
            model: cost.model,
            item_count: 1,
            estimated_cny: cost.cny,
            payload: { aspect_ratio: aspectRatio, source_node_id: 'shotlist_render' },
          },
        })
        operations.deriveNode(nodes.find((node) => node.id === 'video') ?? nodes[0], {
          status: 'loading',
          title: '视频生成 · 新版本',
          cost,
        })
        await onRefresh()
      },
    })
  }, [aspectRatio, estimate, nodes, onRefresh, operations, projectId, snapshot?.session_id])

  const markFreeReview = useCallback(async () => {
    if (!snapshot?.session_id) return
    await StudioProjectsService.createProjectCanvasActionApiV1StudioProjectsProjectIdCanvasActionsPost({
      projectId,
      requestBody: {
        session_id: snapshot.session_id,
        action: 'shotlist_text_ready',
        idempotency_key: newIdempotencyKey('canvas:shotlist-text'),
        payload: { source_node_id: 'storyboard', aspect_ratio: aspectRatio },
      },
    })
    operations.deriveNode(nodes.find((node) => node.id === 'shotlist_text') ?? nodes[0], {
      status: 'ready',
      title: '文字分镜表 · 预审版',
    })
    await onRefresh()
  }, [aspectRatio, nodes, onRefresh, operations, projectId, snapshot?.session_id])

  const previewRows = useMemo(() => previewRowsFromNodes(nodes), [nodes])

  const markRenderedShotlist = useCallback(async () => {
    if (!snapshot?.session_id) return
    await StudioProjectsService.createProjectCanvasActionApiV1StudioProjectsProjectIdCanvasActionsPost({
      projectId,
      requestBody: {
        session_id: snapshot.session_id,
        action: 'shotlist_render_ready',
        idempotency_key: newIdempotencyKey('canvas:shotlist-render'),
        payload: { source_node_id: 'keyframe', aspect_ratio: aspectRatio, reuse_keyframes: true },
      },
    })
    operations.deriveNode(nodes.find((node) => node.id === 'shotlist_render') ?? nodes[0], {
      status: 'ready',
      title: '渲染版分镜表 · 新版本',
    })
    await onRefresh()
  }, [aspectRatio, nodes, onRefresh, operations, projectId, snapshot?.session_id])

  const renderedNodes = useMemo(() => nodes.map((node) => ({
    ...node,
    data: { ...node.data, __ops: operations },
  })), [nodes, operations])

  if (!hydrated) return <div className="flex h-full items-center justify-center bg-black"><Spin /></div>

  return (
    <div className="relative h-full">
      {agentError ? <Alert className="absolute left-6 top-20 z-20 w-[360px]" type="warning" showIcon message={agentError} /> : null}
      <ReactFlow
        nodes={renderedNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        minZoom={0.18}
        maxZoom={2}
        selectionOnDrag
        panOnScroll
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onMoveEnd={() => saveCanvas(nodes, edges)}
      >
        <Background color="rgba(255,255,255,.11)" gap={28} variant={BackgroundVariant.Dots} />
        <MiniMap className="!bg-black/80" maskColor="rgba(0,0,0,.58)" nodeColor={() => '#ffffff'} />
        <Controls className="nuwa-flow-controls" />
      </ReactFlow>
      <CanvasToolbar
        modelReady={modelStatus.text && modelStatus.image && modelStatus.video}
        modelLabels={modelStatus.labels}
        onFitView={() => flow.fitView({ padding: 0.18 })}
        onRefresh={onRefresh}
        onPreviewShotlist={() => setShotlistPreviewOpen(true)}
        onConfirmKeyframes={confirmKeyframeRender}
        onBuildRenderedShotlist={() => void markRenderedShotlist()}
        onConfirmVideo={confirmVideoGeneration}
      />
      <div className={`nuwa-agent-float ${agentCollapsed ? 'nuwa-agent-float-collapsed' : ''}`}>
        <AgentDock
          messages={snapshot?.messages ?? []}
          questionCard={snapshot?.question_card}
          revision={snapshot?.revision ?? 0}
          loading={agentLoading}
          submitting={agentSubmitting}
          error={agentError}
          collapsed={agentCollapsed}
          onCollapse={() => setAgentCollapsed(true)}
          onExpand={() => setAgentCollapsed(false)}
          onRefresh={onRefresh}
          onChoice={onChoice}
          onText={onText}
        />
      </div>
      <ShotlistPreviewModal
        open={shotlistPreviewOpen}
        rows={previewRows}
        onCancel={() => setShotlistPreviewOpen(false)}
        onConfirm={async () => {
          setShotlistPreviewOpen(false)
          await markFreeReview()
          confirmKeyframeRender()
        }}
      />
    </div>
  )
}
