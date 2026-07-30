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
import { Alert, Button, Modal, Spin, Tag, message } from 'antd'
import { ApiOutlined, DownloadOutlined, FullscreenOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  LlmService,
  StudioChaptersService,
  StudioProjectsService,
  type AgentWorkspaceSnapshotRead,
  type ModelRead,
  type ProjectAssetLibraryRead,
  type ProjectRead,
} from '../../services/generated'
import { nodeTypes } from '../../components/nodes'
import { AgentDock } from './AgentDock'
import { DEFAULT_CANVAS_RATIO, type NuwaCanvasNodeData } from './types'
import { useAutoLayout } from './hooks/useAutoLayout'
import { useGenerationCost } from './hooks/useGenerationCost'
import { useNodeOperations } from './hooks/useNodeOperations'

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

function nowIso() {
  return new Date().toISOString()
}

function newIdempotencyKey(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}:${crypto.randomUUID()}`
  return `${prefix}:${Date.now()}:${Math.random().toString(16).slice(2)}`
}

function savedLooksLikeBatch6(nodes?: Node[]) {
  const nodeTypesInState = new Set((nodes ?? []).map((node) => node.type))
  return nodeTypesInState.has('script') && nodeTypesInState.has('video')
}

function storyboardPanels(snapshot: AgentWorkspaceSnapshotRead | null) {
  const artifacts = Object.values(snapshot?.artifacts ?? {}) as Array<{ content_json?: Record<string, unknown> }>
  for (const artifact of artifacts) {
    const content = artifact.content_json ?? {}
    const pages = Array.isArray(content.pages) ? content.pages : []
    const page = pages.find((item) => item && typeof item === 'object')
    if (page) return { pages: [page as Record<string, unknown>] }
  }
  return undefined
}

function persistableNodes(nodes: Node<NuwaCanvasNodeData>[]) {
  return nodes.map((node) => {
    const { __ops: _ops, ...data } = node.data
    return { ...node, data }
  })
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
  const [modelStatus, setModelStatus] = useState<{ text: boolean; image: boolean; video: boolean; labels: string[] }>({
    text: false,
    image: false,
    video: false,
    labels: [],
  })
  const canvasId = chapterId ? `chapter:${chapterId}` : `project:${projectId}`
  const aspectRatio = project?.default_video_ratio || DEFAULT_CANVAS_RATIO
  const operations = useNodeOperations({
    flow,
    nodes,
    edges,
    setNodes,
    setEdges,
  })

  const initialGraph = useMemo(() => {
    const base = {
      project_id: projectId,
      canvas_id: canvasId,
      status: 'empty' as const,
      created_at: nowIso(),
    }
    const character = library?.characters?.[0]
    const scene = library?.scenes?.[0]
    const prop = library?.props?.[0]
    const builtNodes: Node<NuwaCanvasNodeData>[] = [
      {
        id: 'script',
        type: 'script',
        position: positionFor('script', 0),
        data: {
          ...base,
          status: snapshot?.artifacts?.['story_summary:v1'] ? 'ready' : 'empty',
          title: '剧本 · 第1章',
          raw_script: snapshot?.artifacts?.['story_summary:v1']?.content_text || '',
          parsed: {
            story_structure: snapshot?.artifacts?.['story_summary:v1']?.content_json,
            characters: library?.characters?.map((item) => item.name) ?? [],
            shots_info: snapshot?.artifacts?.['storyboard:v1']?.content_json,
          },
        },
      },
      {
        id: character ? `character:${character.id}` : 'character:empty',
        type: 'character',
        position: positionFor('character', 0),
        data: {
          ...base,
          status: character ? 'ready' : 'empty',
          name: character?.name || '待生成角色',
          character_id: character?.id,
          bible_json: character?.bible,
          reference_layout: 'four_view',
          linked_existing: false,
          images: {
            face_closeup: character?.reference_images?.[0]?.url,
            full_front: character?.reference_images?.[1]?.url,
            full_side: character?.reference_images?.[2]?.url,
            full_back: character?.reference_images?.[3]?.url,
          },
        },
      },
      {
        id: scene ? `location:${scene.id}` : 'location:empty',
        type: 'location',
        position: positionFor('location', 1),
        data: {
          ...base,
          status: scene ? 'ready' : 'empty',
          name: scene?.name || '待生成场景',
          location_id: scene?.id,
          mood: scene?.description,
          subtitle: aspectRatio,
          images: scene?.reference_images?.map((item) => item.url).filter(Boolean) ?? [],
        },
      },
      {
        id: prop ? `prop:${prop.id}` : 'prop:empty',
        type: 'prop',
        position: positionFor('prop', 2),
        data: {
          ...base,
          status: prop ? 'ready' : 'empty',
          name: prop?.name || '待生成道具',
          prop_id: prop?.id,
          is_wearable: false,
          image: prop?.reference_images?.[0]?.url,
        },
      },
      {
        id: 'storyboard',
        type: 'storyboard',
        position: positionFor('storyboard', 0),
        data: { ...base, status: storyboardPanels(snapshot) ? 'ready' : 'empty', content_json: storyboardPanels(snapshot) },
      },
      { id: 'shot_group', type: 'shot_group', position: positionFor('shot_group', 0), data: { ...base, shots: [] } },
      { id: 'shotlist_text', type: 'shotlist_text', position: positionFor('shotlist_text', 1), data: { ...base, rows: [] } },
      { id: 'keyframe', type: 'keyframe', position: positionFor('keyframe', 0), data: { ...base, seed: project?.seed || 0, frames: [] } },
      { id: 'shotlist_render', type: 'shotlist_render', position: positionFor('shotlist_render', 0), data: { ...base, rows: [] } },
      { id: 'video', type: 'video', position: positionFor('video', 0), data: { ...base, aspect_ratio: aspectRatio } },
    ]
    const builtEdges: Edge[] = [
      { id: 'script-character', source: 'script', target: builtNodes[1].id },
      { id: 'script-location', source: 'script', target: builtNodes[2].id },
      { id: 'script-prop', source: 'script', target: builtNodes[3].id },
      { id: 'script-storyboard', source: 'script', target: 'storyboard', animated: true },
      { id: 'storyboard-shotlist-text', source: 'storyboard', target: 'shotlist_text', animated: true },
      { id: 'storyboard-shot-group', source: 'storyboard', target: 'shot_group', animated: true },
      { id: 'shotlist-text-keyframe', source: 'shotlist_text', target: 'keyframe', animated: true },
      { id: 'keyframe-shotlist-render', source: 'keyframe', target: 'shotlist_render', animated: true },
      { id: 'shotlist-render-video', source: 'shotlist_render', target: 'video', animated: true },
    ]
    return { nodes: builtNodes, edges: builtEdges }
  }, [aspectRatio, canvasId, library, positionFor, project?.seed, projectId, snapshot])

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
          setNodes(savedNodes)
          setEdges(savedEdges)
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

  useEffect(() => {
    let cancelled = false
    const loadModelStatus = async () => {
      try {
        const [settingsRes, modelsRes] = await Promise.all([
          LlmService.getModelSettingsApiV1LlmModelSettingsGet(),
          LlmService.listModelsApiV1LlmModelsGet({ page: 1, pageSize: 100 }),
        ])
        if (cancelled) return
        const settings = settingsRes.data
        const models = (modelsRes.data?.items ?? []) as ModelRead[]
        const byId = new Map(models.map((model) => [model.id, model]))
        const text = Boolean(settings?.default_text_model_id && byId.get(settings.default_text_model_id))
        const image = Boolean(settings?.default_image_model_id && byId.get(settings.default_image_model_id))
        const video = Boolean(settings?.default_video_model_id && byId.get(settings.default_video_model_id))
        setModelStatus({
          text,
          image,
          video,
          labels: [
            byId.get(settings?.default_text_model_id || '')?.name || 'DeepSeek 未绑定',
            byId.get(settings?.default_image_model_id || '')?.name || 'Seedream 未绑定',
            byId.get(settings?.default_video_model_id || '')?.name || 'Seedance 未绑定',
          ],
        })
      } catch {
        if (!cancelled) setModelStatus({ text: false, image: false, video: false, labels: ['模型配置读取失败'] })
      }
    }
    void loadModelStatus()
    return () => { cancelled = true }
  }, [])

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((current) => {
      const next = applyNodeChanges(changes, current) as Node<NuwaCanvasNodeData>[]
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
        onlyRenderVisibleElements
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
      <div className="pointer-events-none absolute left-6 top-5 z-10 flex items-center gap-2">
        <Button className="pointer-events-auto !border-white/12 !bg-black !text-white" icon={<FullscreenOutlined />} onClick={() => flow.fitView({ padding: 0.18 })}>
          全览
        </Button>
        <Button className="pointer-events-auto !border-white/12 !bg-black !text-white" icon={<ReloadOutlined />} onClick={onRefresh}>
          刷新数据
        </Button>
        <Tag className="pointer-events-auto !m-0 !border-white/12 !bg-black !px-3 !py-1 !text-white/72">
          模型 {modelStatus.text && modelStatus.image && modelStatus.video ? '已绑定' : '待配置'} · {modelStatus.labels.join(' / ')}
        </Tag>
        <Button className="pointer-events-auto !border-white/12 !bg-black !text-white" icon={<ApiOutlined />}>
          资产库
        </Button>
        <Button className="pointer-events-auto !border-white/12 !bg-black !text-white" icon={<DownloadOutlined />}>
          打包下载视频
        </Button>
        <Button className="pointer-events-auto !border-white/12 !bg-black !text-white" onClick={() => void markFreeReview()}>
          文字预审通过
        </Button>
        <Button className="pointer-events-auto !border-white/12 !bg-black !text-white" onClick={confirmKeyframeRender}>
          确认渲染关键帧
        </Button>
        <Button className="pointer-events-auto !border-white/12 !bg-black !text-white" onClick={() => void markRenderedShotlist()}>
          生成渲染分镜表
        </Button>
        <Button className="pointer-events-auto !border-white/12 !bg-black !text-white" onClick={confirmVideoGeneration}>
          确认出视频
        </Button>
      </div>
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
    </div>
  )
}
