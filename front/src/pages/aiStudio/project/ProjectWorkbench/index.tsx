import '@xyflow/react/dist/style.css'

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
  type Viewport,
} from '@xyflow/react'
import {
  ApiOutlined,
  AppstoreAddOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  FileImageOutlined,
  FileTextOutlined,
  FullscreenOutlined,
  NodeIndexOutlined,
  PictureOutlined,
  ReloadOutlined,
  ScissorOutlined,
  UserOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons'
import { Alert, Button, Empty, Modal, Spin, Tag, message } from 'antd'
import { useNavigate, useParams } from 'react-router-dom'
import JSZip from 'jszip'
import { StudioProjectsService, type AgentWorkspaceSnapshotRead, type ProjectAssetLibraryRead } from '../../../../services/generated'
import { AgentChat } from './agent/AgentChat'
import { useProject } from './hooks/useProjectData'
import { useWorkspaceSnapshot } from './useWorkspaceSnapshot'
import { buildFileDownloadUrl, resolveAssetUrl } from '../assetUrls'

type CanvasNodeKind =
  | 'script'
  | 'character'
  | 'scene'
  | 'storyboard'
  | 'shot_group'
  | 'keyframe'
  | 'shot_sheet'
  | 'video'

type CanvasNodeData = {
  kind: CanvasNodeKind
  title: string
  subtitle?: string
  imageUrl?: string
  imageUrls?: string[]
  tags?: string[]
  body?: string
  items?: string[]
  downloadableUrls?: { name: string; url: string }[]
  onPreview?: (data: CanvasNodeData) => void
  onExport?: (data: CanvasNodeData) => void
}

type CanvasMenu = {
  x: number
  y: number
  flowX: number
  flowY: number
} | null

type NodeMenu = {
  x: number
  y: number
  node: Node<CanvasNodeData>
} | null

const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 0.82 }

const nodeTone: Record<CanvasNodeKind, string> = {
  script: 'from-sky-400/18 to-white/5',
  character: 'from-fuchsia-400/18 to-white/5',
  scene: 'from-emerald-400/18 to-white/5',
  storyboard: 'from-amber-300/18 to-white/5',
  shot_group: 'from-cyan-300/18 to-white/5',
  keyframe: 'from-violet-300/18 to-white/5',
  shot_sheet: 'from-blue-300/18 to-white/5',
  video: 'from-rose-300/18 to-white/5',
}

const nodeIcon: Record<CanvasNodeKind, React.ReactNode> = {
  script: <FileTextOutlined />,
  character: <UserOutlined />,
  scene: <PictureOutlined />,
  storyboard: <FileImageOutlined />,
  shot_group: <NodeIndexOutlined />,
  keyframe: <ScissorOutlined />,
  shot_sheet: <AppstoreAddOutlined />,
  video: <VideoCameraOutlined />,
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function artifactContent(item: unknown): Record<string, unknown> {
  return asRecord(asRecord(item).content_json)
}

function findStoryboardPage(snapshot: AgentWorkspaceSnapshotRead | null): Record<string, unknown> | null {
  const artifacts = Object.values(snapshot?.artifacts ?? {}) as unknown[]
  for (const item of artifacts) {
    const content = artifactContent(item)
    const pages = Array.isArray(content.pages) ? content.pages : []
    const page = pages.find((row: unknown) => Array.isArray(asRecord(row).panels))
    if (page) return asRecord(page)
  }
  return null
}

function firstImage(item: { reference_images?: Array<{ is_primary?: boolean; url?: string; file_id?: string }> }): string | undefined {
  const images = item.reference_images ?? []
  const primary = images.find((image) => image.is_primary) ?? images[0]
  return resolveAssetUrl(primary?.url || primary?.file_id)
}

function fileUrlFromArtifact(row: unknown): string | undefined {
  const content = artifactContent(row)
  const fileId = content.file_id || content.image_file_id || content.video_file_id
  const url = content.url || content.image_url || content.video_url
  return resolveAssetUrl(typeof url === 'string' ? url : typeof fileId === 'string' ? fileId : undefined)
}

function asStoryboardPanel(value: unknown): Record<string, unknown> {
  return asRecord(value)
}

function asShotGroup(value: unknown): Record<string, unknown> {
  return asRecord(value)
}

function buildAutoNodes(
  snapshot: AgentWorkspaceSnapshotRead | null,
  library: ProjectAssetLibraryRead | null,
): { nodes: Node<CanvasNodeData>[]; edges: Edge[] } {
  const artifacts = snapshot?.artifacts ?? {}
  const page = findStoryboardPage(snapshot)
  const pageRecord = page ?? {}
  const storyboardImage = typeof pageRecord.image_url === 'string'
    ? pageRecord.image_url
    : typeof pageRecord.image_file_id === 'string'
      ? buildFileDownloadUrl(pageRecord.image_file_id)
      : undefined
  const panels = Array.isArray(pageRecord.panels) ? pageRecord.panels.map(asStoryboardPanel) : []
  const shots = Array.isArray(pageRecord.shots) ? pageRecord.shots.map(asShotGroup) : []
  const artifactRows = Object.values(artifacts) as unknown[]
  const keyframeUrls = artifactRows
    .filter((row) => String(asRecord(row).kind ?? '').includes('frame') || String(asRecord(row).kind ?? '').includes('keyframe'))
    .map(fileUrlFromArtifact)
    .filter(Boolean) as string[]
  const videoUrls = artifactRows
    .filter((row) => String(asRecord(row).kind ?? '').includes('video'))
    .map(fileUrlFromArtifact)
    .filter(Boolean) as string[]

  const nodes: Node<CanvasNodeData>[] = [
    {
      id: 'script',
      type: 'nuwa',
      position: { x: 0, y: 80 },
      data: {
        kind: 'script',
        title: '剧本 / 脚本',
        subtitle: snapshot?.stage ? `阶段：${snapshot.stage}` : '等待剧情分析',
        body: artifacts['story_summary:v1']?.content_text || 'Agent 分析完成后，这里显示故事摘要、规格确认和脚本抽取结果。',
        tags: [snapshot?.status ?? 'loading', `revision ${snapshot?.revision ?? 0}`],
      },
    },
    {
      id: 'storyboard',
      type: 'nuwa',
      position: { x: 760, y: 40 },
      data: {
        kind: 'storyboard',
        title: '6 格手绘故事板',
        subtitle: panels.length ? `${panels.filter((panel) => !panel.is_blank).length} 个内容格` : '等待故事板',
        imageUrl: storyboardImage,
        body: panels.length ? panels.map((panel) => `${String(panel.shot_index ?? '')}. ${String(panel.visible_summary ?? '空白格')}`).join('\n') : '生成后显示故事板 PNG 与每格一句话说明。',
        items: panels.slice(0, 6).map((panel) => `${String(panel.shot_index ?? '')} ${String(panel.visible_summary ?? '空白格')}`),
        downloadableUrls: storyboardImage ? [{ name: 'storyboard-page.png', url: storyboardImage }] : [],
      },
    },
    {
      id: 'shot_group',
      type: 'nuwa',
      position: { x: 1140, y: 60 },
      data: {
        kind: 'shot_group',
        title: '镜头分组',
        subtitle: shots.length ? `${shots.length} 个镜头` : '等待分组',
        body: shots.length
          ? shots.map((shot) => `镜头 ${String(shot.shot_group ?? '')}: 格 ${String(shot.first_cell ?? '')}-${String(shot.last_cell ?? '')} · ${String(shot.camera_shot ?? '')} · ${String(shot.movement ?? '')}`).join('\n')
          : '故事板确认后自动生成 2-3 个镜头分组。',
        items: shots.map((shot) => `${String(shot.duration_seconds ?? 1)}s · ${String(shot.screen_direction ?? '轴线保持')}`),
      },
    },
    {
      id: 'keyframe',
      type: 'nuwa',
      position: { x: 1520, y: 40 },
      data: {
        kind: 'keyframe',
        title: '超写实关键帧',
        subtitle: keyframeUrls.length ? `${keyframeUrls.length} 张已渲染` : '等待逐格渲染',
        imageUrls: keyframeUrls,
        body: '前 5 个内容格逐格渲染，一图两用：分镜表图 + Seedance 首尾帧。',
        downloadableUrls: keyframeUrls.map((url, index) => ({ name: `keyframe-${index + 1}.png`, url })),
      },
    },
    {
      id: 'shot_sheet',
      type: 'nuwa',
      position: { x: 1900, y: 60 },
      data: {
        kind: 'shot_sheet',
        title: '分镜表 PNG',
        subtitle: '6 格源码排版',
        body: '前 5 格左图右列，第 6 格空白。导出入口在这里。',
        downloadableUrls: storyboardImage ? [{ name: 'shot-sheet-source.png', url: storyboardImage }] : [],
      },
    },
    {
      id: 'video',
      type: 'nuwa',
      position: { x: 2280, y: 40 },
      data: {
        kind: 'video',
        title: 'Seedance 视频片段',
        subtitle: videoUrls.length ? `${videoUrls.length} 条片段` : '等待生成',
        imageUrls: videoUrls,
        body: '用户确认“是否进行视频生成”后，逐镜头生成可下载视频片段。',
        downloadableUrls: videoUrls.map((url, index) => ({ name: `video-shot-${index + 1}.mp4`, url })),
      },
    },
  ]

  ;(library?.characters ?? []).forEach((character, index) => {
    nodes.push({
      id: `character:${character.id}`,
      type: 'nuwa',
      position: { x: 380, y: index * 290 },
      data: {
        kind: 'character',
        title: character.name,
        subtitle: '角色资产 / 四视图 / 圣经',
        imageUrl: firstImage(character),
        body: character.description || JSON.stringify(character.bible ?? {}, null, 2),
        tags: ['角色圣经', character.reference_images?.length ? `${character.reference_images.length} 张参考图` : '无参考图'],
        downloadableUrls: (character.reference_images ?? []).map((image, imageIndex) => ({
          name: `${character.name}-reference-${imageIndex + 1}.png`,
          url: resolveAssetUrl(image.url || image.file_id) ?? '',
        })).filter((item) => item.url),
      },
    })
  })

  ;(library?.scenes ?? []).forEach((scene, index) => {
    nodes.push({
      id: `scene:${scene.id}`,
      type: 'nuwa',
      position: { x: 380, y: 360 + index * 240 },
      data: {
        kind: 'scene',
        title: scene.name,
        subtitle: '场景资产',
        imageUrl: firstImage(scene),
        body: scene.description,
        tags: ['场景', scene.reference_images?.length ? `${scene.reference_images.length} 张参考图` : '无参考图'],
        downloadableUrls: (scene.reference_images ?? []).map((image, imageIndex) => ({
          name: `${scene.name}-reference-${imageIndex + 1}.png`,
          url: resolveAssetUrl(image.url || image.file_id) ?? '',
        })).filter((item) => item.url),
      },
    })
  })

  const characterEdges = (library?.characters ?? []).map((character) => ({
    id: `script-character-${character.id}`,
    source: 'script',
    target: `character:${character.id}`,
    animated: true,
  }))
  const sceneEdges = (library?.scenes ?? []).map((scene) => ({
    id: `script-scene-${scene.id}`,
    source: 'script',
    target: `scene:${scene.id}`,
    animated: true,
  }))
  const edges: Edge[] = [
    ...characterEdges,
    ...sceneEdges,
    { id: 'script-storyboard', source: 'script', target: 'storyboard', animated: true },
    { id: 'storyboard-shot-group', source: 'storyboard', target: 'shot_group', animated: true },
    { id: 'shot-group-keyframe', source: 'shot_group', target: 'keyframe', animated: true },
    { id: 'keyframe-shot-sheet', source: 'keyframe', target: 'shot_sheet', animated: true },
    { id: 'shot-sheet-video', source: 'shot_sheet', target: 'video', animated: true },
  ]
  return { nodes, edges }
}

function NuwaNode({ data, selected }: NodeProps<Node<CanvasNodeData>>) {
  const imageUrls = data.imageUrls ?? (data.imageUrl ? [data.imageUrl] : [])

  return (
    <div className={`nuwa-flow-node ${selected ? 'nuwa-flow-node-selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className={`nuwa-flow-node-glow bg-gradient-to-br ${nodeTone[data.kind]}`} />
      <div className="relative z-10">
        <div className="mb-3 flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/12 bg-black text-lg text-white">
            {nodeIcon[data.kind]}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">{data.title}</div>
            <div className="mt-1 line-clamp-1 text-[11px] text-white/46">{data.subtitle}</div>
          </div>
        </div>
        {imageUrls.length ? (
          <div className="mb-3 grid grid-cols-2 gap-2">
            {imageUrls.slice(0, 4).map((url, index) => (
              <div key={`${url}-${index}`} className="aspect-[9/16] overflow-hidden rounded-lg border border-white/10 bg-black">
                {String(url).match(/\.(mp4|webm|mov)(\?|$)/i) ? (
                  <video src={url} className="h-full w-full object-contain" controls />
                ) : (
                  <img src={url} alt={data.title} className="h-full w-full object-contain" />
                )}
              </div>
            ))}
          </div>
        ) : null}
        {data.body ? <pre className="nuwa-flow-node-body">{data.body}</pre> : null}
        {data.items?.length ? (
          <div className="mt-3 space-y-1.5">
            {data.items.slice(0, 5).map((item, index) => (
              <div key={`${item}-${index}`} className="rounded-md bg-white/[.055] px-2 py-1 text-[11px] leading-relaxed text-white/58">
                {item}
              </div>
            ))}
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(data.tags ?? []).map((tag) => (
            <Tag key={tag} className="mr-0 rounded-full border-white/10 bg-white/[.08] text-[10px] text-white/70">
              {tag}
            </Tag>
          ))}
        </div>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

const nodeTypes: NodeTypes = { nuwa: memo(NuwaNode) }

function FlowInner({
  projectId,
  snapshot,
  library,
  onRefresh,
  onChoice,
  onText,
  agentLoading,
  agentSubmitting,
  agentError,
}: {
  projectId: string
  snapshot: AgentWorkspaceSnapshotRead | null
  library: ProjectAssetLibraryRead | null
  onRefresh: () => void
  onChoice: (choiceId: string) => void
  onText: (text: string) => void
  agentLoading: boolean
  agentSubmitting: boolean
  agentError?: string | null
}) {
  const navigate = useNavigate()
  const flow = useReactFlow()
  const saveTimer = useRef<number | null>(null)
  const [nodes, setNodes] = useState<Node<CanvasNodeData>[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [menu, setMenu] = useState<CanvasMenu>(null)
  const [nodeMenu, setNodeMenu] = useState<NodeMenu>(null)
  const [preview, setPreview] = useState<CanvasNodeData | null>(null)
  const [hydrated, setHydrated] = useState(false)

  const autoGraph = useMemo(() => buildAutoNodes(snapshot, library), [library, snapshot])

  const saveCanvas = useCallback((nextNodes: Node<CanvasNodeData>[], nextEdges: Edge[]) => {
    if (!hydrated) return
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      const viewport = flow.getViewport()
      if (typeof StudioProjectsService.updateProjectCanvasStateApiV1StudioProjectsProjectIdCanvasStatePatch !== 'function') {
        window.localStorage.setItem(`nuwa_canvas_state:${projectId}`, JSON.stringify({ nodes: nextNodes, edges: nextEdges, viewport }))
        return
      }
      void StudioProjectsService.updateProjectCanvasStateApiV1StudioProjectsProjectIdCanvasStatePatch({
        projectId,
        requestBody: { nodes: nextNodes, edges: nextEdges, viewport },
      })
    }, 500)
  }, [flow, hydrated, projectId])

  useEffect(() => {
    let cancelled = false
    const hydrate = async () => {
      let saved: { nodes?: Node<CanvasNodeData>[]; edges?: Edge[]; viewport?: Viewport } | null = null
      try {
        if (typeof StudioProjectsService.getProjectCanvasStateApiV1StudioProjectsProjectIdCanvasStateGet === 'function') {
          const res = await StudioProjectsService.getProjectCanvasStateApiV1StudioProjectsProjectIdCanvasStateGet({ projectId })
          saved = res.data
            ? {
                nodes: res.data.nodes as Node<CanvasNodeData>[] | undefined,
                edges: res.data.edges as Edge[] | undefined,
                viewport: res.data.viewport as Viewport | undefined,
              }
            : null
        } else {
          saved = JSON.parse(window.localStorage.getItem(`nuwa_canvas_state:${projectId}`) || 'null')
        }
      } catch {
        saved = null
      }
      if (cancelled) return
      const savedValue = saved
      const savedNodes = savedValue && Array.isArray(savedValue.nodes) ? savedValue.nodes : []
      const savedNodeMap = new Map(savedNodes.map((node) => [node.id, node]))
      const mergedNodes = autoGraph.nodes.map((node) => {
        const old = savedNodeMap.get(node.id)
        return old ? { ...node, position: old.position, selected: false } : node
      })
      const manualNodes = savedNodes.filter((node) => !autoGraph.nodes.some((item) => item.id === node.id))
      setNodes([...mergedNodes, ...manualNodes])
      setEdges(savedValue && Array.isArray(savedValue.edges) && savedValue.edges.length ? savedValue.edges : autoGraph.edges)
      setHydrated(true)
      const viewport = savedValue?.viewport ?? DEFAULT_VIEWPORT
      window.setTimeout(() => flow.setViewport(viewport), 0)
    }
    void hydrate()
    return () => {
      cancelled = true
    }
  }, [autoGraph.edges, autoGraph.nodes, flow, projectId])

  useEffect(() => {
    if (!hydrated) return
    setNodes((prev) => {
      const byId = new Map(prev.map((node) => [node.id, node]))
      const merged = autoGraph.nodes.map((node) => {
        const old = byId.get(node.id)
        return old ? { ...node, position: old.position, selected: old.selected } : node
      })
      const manual = prev.filter((node) => !autoGraph.nodes.some((item) => item.id === node.id))
      return [...merged, ...manual]
    })
    setEdges((prev) => (prev.length ? prev : autoGraph.edges))
  }, [autoGraph.edges, autoGraph.nodes, hydrated])

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((current) => {
      const next = applyNodeChanges(changes, current) as Node<CanvasNodeData>[]
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
    setEdges((current) => {
      const next = addEdge({ ...connection, animated: true }, current)
      saveCanvas(nodes, next)
      return next
    })
  }, [nodes, saveCanvas])

  const addManualNode = useCallback((kind: CanvasNodeKind, position?: { x: number; y: number }) => {
    const id = `manual:${kind}:${Date.now()}:${Math.random().toString(16).slice(2)}`
    const node: Node<CanvasNodeData> = {
      id,
      type: 'nuwa',
      position: position ?? { x: 120, y: 120 },
      data: {
        kind,
        title: `手动${kind}`,
        subtitle: '用户手动实例化节点',
        body: '右键菜单创建，可接入上游节点或等待 Agent 写入真实数据。',
        tags: ['manual'],
      },
    }
    setNodes((current) => {
      const next = [...current, node]
      saveCanvas(next, edges)
      return next
    })
    setMenu(null)
  }, [edges, saveCanvas])

  const exportNode = useCallback(async (data: CanvasNodeData) => {
    const files = (data.downloadableUrls ?? []).filter((item) => item.url)
    if (!files.length) {
      message.info('这个节点暂无可下载产物')
      return
    }
    if (files.length === 1) {
      window.open(files[0].url, '_blank', 'noopener,noreferrer')
      return
    }
    const zip = new JSZip()
    await Promise.all(files.map(async (file) => {
      const response = await fetch(file.url)
      zip.file(file.name, await response.blob())
    }))
    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${data.title}-exports.zip`
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const copySelected = useCallback(() => {
    const selected = nodes.filter((node) => node.selected)
    if (!selected.length) return
    const copies = selected.map((node) => ({
      ...node,
      id: `manual:copy:${Date.now()}:${Math.random().toString(16).slice(2)}`,
      selected: false,
      position: { x: node.position.x + 36, y: node.position.y + 36 },
      data: { ...node.data, title: `${node.data.title} 副本`, tags: [...(node.data.tags ?? []), 'copy'] },
    }))
    setNodes((current) => {
      const next = [...current, ...copies]
      saveCanvas(next, edges)
      return next
    })
  }, [edges, nodes, saveCanvas])

  const deleteSelected = useCallback(() => {
    const selectedIds = new Set(nodes.filter((node) => node.selected).map((node) => node.id))
    setNodes((current) => {
      const next = current.filter((node) => !selectedIds.has(node.id))
      saveCanvas(next, edges.filter((edge) => !selectedIds.has(edge.source) && !selectedIds.has(edge.target)))
      return next
    })
    setEdges((current) => current.filter((edge) => !selectedIds.has(edge.source) && !selectedIds.has(edge.target)))
  }, [edges, nodes, saveCanvas])

  const copySingleNode = useCallback((node: Node<CanvasNodeData>) => {
    const copy: Node<CanvasNodeData> = {
      ...node,
      id: `manual:copy:${Date.now()}:${Math.random().toString(16).slice(2)}`,
      selected: false,
      position: { x: node.position.x + 36, y: node.position.y + 36 },
      data: { ...node.data, title: `${node.data.title} 副本`, tags: [...(node.data.tags ?? []), 'copy'] },
    }
    setNodes((current) => {
      const next = [...current, copy]
      saveCanvas(next, edges)
      return next
    })
  }, [edges, saveCanvas])

  const deleteSingleNode = useCallback((node: Node<CanvasNodeData>) => {
    setNodes((current) => {
      const next = current.filter((item) => item.id !== node.id)
      const nextEdges = edges.filter((edge) => edge.source !== node.id && edge.target !== node.id)
      setEdges(nextEdges)
      saveCanvas(next, nextEdges)
      return next
    })
  }, [edges, saveCanvas])

  /** 将节点级重生成请求交给 Agent Policy 处理，前端不直接调用模型或生成服务。 */
  const requestNodeRegenerate = useCallback((node: Node<CanvasNodeData>) => {
    const kindLabel =
      node.data.kind === 'character'
        ? '角色'
        : node.data.kind === 'scene'
          ? '场景'
          : node.data.kind === 'keyframe'
            ? '关键帧'
            : node.data.kind === 'storyboard'
              ? '故事板'
              : node.data.kind === 'video'
                ? '视频'
                : '节点'
    onText(`请重新生成${kindLabel}「${node.data.title}」，只更新这个节点对应的产物，不回退阶段，不影响其他资产。`)
  }, [onText])

  if (!hydrated) {
    return <div className="flex h-full items-center justify-center bg-black"><Spin /></div>
  }

  return (
    <div className="relative h-full">
      <ReactFlow
        nodes={nodes.map((node) => ({
          ...node,
          data: { ...node.data, onPreview: setPreview, onExport: exportNode },
        }))}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.18}
        maxZoom={2}
        onlyRenderVisibleElements
        selectionOnDrag
        panOnScroll
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onPaneClick={() => {
          setMenu(null)
          setNodeMenu(null)
        }}
        onPaneContextMenu={(event) => {
          event.preventDefault()
          const bounds = (event.target as Element).closest('.react-flow')?.getBoundingClientRect()
          const position = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY })
          setMenu({
            x: event.clientX - (bounds?.left ?? 0),
            y: event.clientY - (bounds?.top ?? 0),
            flowX: position.x,
            flowY: position.y,
          })
        }}
        onNodeContextMenu={(event, node) => {
          event.preventDefault()
          const bounds = (event.target as Element).closest('.react-flow')?.getBoundingClientRect()
          setNodeMenu({
            x: event.clientX - (bounds?.left ?? 0),
            y: event.clientY - (bounds?.top ?? 0),
            node: node as Node<CanvasNodeData>,
          })
        }}
        onMoveEnd={(_, viewport) => {
          saveCanvas(nodes, edges)
          window.localStorage.setItem(`nuwa_canvas_viewport:${projectId}`, JSON.stringify(viewport))
        }}
      >
        <Background color="rgba(255,255,255,.11)" gap={28} variant={BackgroundVariant.Dots} />
        <MiniMap className="!bg-black/80" maskColor="rgba(0,0,0,.58)" nodeColor={() => '#ffffff'} />
        <Controls className="nuwa-flow-controls" />
      </ReactFlow>

      <div className="pointer-events-none absolute left-6 top-5 z-10 flex items-center gap-2">
        <Button className="pointer-events-auto !border-white/12 !bg-black !text-white" icon={<FullscreenOutlined />} onClick={() => flow.fitView({ padding: 0.18 })}>
          全览
        </Button>
        <Button className="pointer-events-auto !border-white/12 !bg-black !text-white" icon={<CopyOutlined />} onClick={copySelected}>
          复制
        </Button>
        <Button className="pointer-events-auto !border-white/12 !bg-black !text-white" icon={<DeleteOutlined />} onClick={deleteSelected}>
          删除
        </Button>
        <Button className="pointer-events-auto !border-white/12 !bg-black !text-white" icon={<ReloadOutlined />} onClick={onRefresh}>
          刷新数据
        </Button>
        <Button className="pointer-events-auto !border-white/12 !bg-black !text-white" icon={<ApiOutlined />} onClick={() => navigate(`/projects/${projectId}/asset-library`)}>
          资产库
        </Button>
      </div>

      {menu ? (
        <div className="nuwa-flow-menu" style={{ left: menu.x, top: menu.y }}>
          <div className="mb-2 px-2 text-[11px] font-semibold text-white/45">新增节点</div>
          {(['script', 'character', 'scene', 'storyboard', 'shot_group', 'keyframe', 'shot_sheet', 'video'] as CanvasNodeKind[]).map((kind) => (
            <button key={kind} type="button" onClick={() => addManualNode(kind, { x: menu.flowX, y: menu.flowY })}>
              {nodeIcon[kind]}
              <span>{kind}</span>
            </button>
          ))}
        </div>
      ) : null}

      {nodeMenu ? (
        <div className="nuwa-flow-menu" style={{ left: nodeMenu.x, top: nodeMenu.y }}>
          <div className="mb-2 px-2 text-[11px] font-semibold text-white/45">{nodeMenu.node.data.title}</div>
          <button type="button" onClick={() => { setPreview(nodeMenu.node.data); setNodeMenu(null) }}>
            <FullscreenOutlined />
            <span>查看大图 / 详情</span>
          </button>
          <button type="button" onClick={() => { void exportNode(nodeMenu.node.data); setNodeMenu(null) }}>
            <DownloadOutlined />
            <span>导出节点产物</span>
          </button>
          <button type="button" onClick={() => { requestNodeRegenerate(nodeMenu.node); setNodeMenu(null) }}>
            <ReloadOutlined />
            <span>重新生成</span>
          </button>
          <button type="button" onClick={() => { copySingleNode(nodeMenu.node); setNodeMenu(null) }}>
            <CopyOutlined />
            <span>复制节点</span>
          </button>
          <button type="button" onClick={() => { deleteSingleNode(nodeMenu.node); setNodeMenu(null) }}>
            <DeleteOutlined />
            <span>删除节点</span>
          </button>
        </div>
      ) : null}

      <aside className="absolute right-0 top-0 z-10 h-full w-[410px] border-l border-white/[.08] bg-black/88 backdrop-blur-xl">
        <AgentChat
          messages={snapshot?.messages ?? []}
          questionCard={snapshot?.question_card}
          revision={snapshot?.revision ?? 0}
          loading={agentLoading}
          submitting={agentSubmitting}
          error={agentError}
          onRefresh={onRefresh}
          onChoice={onChoice}
          onText={onText}
        />
      </aside>

      <Modal open={!!preview} footer={null} width={980} onCancel={() => setPreview(null)} title={preview?.title}>
        <div className="space-y-4">
          {(preview?.imageUrls ?? (preview?.imageUrl ? [preview.imageUrl] : [])).map((url, index) => (
            <div key={`${url}-${index}`} className="overflow-hidden rounded-xl bg-black">
              {String(url).match(/\.(mp4|webm|mov)(\?|$)/i) ? (
                <video src={url} className="max-h-[72vh] w-full object-contain" controls />
              ) : (
                <img src={url} alt={preview?.title} className="max-h-[72vh] w-full object-contain" />
              )}
            </div>
          ))}
          {preview?.body ? <pre className="whitespace-pre-wrap rounded-xl bg-black/[.04] p-4 text-sm leading-relaxed">{preview.body}</pre> : null}
          <div className="flex flex-wrap gap-2">
            <Button icon={<DownloadOutlined />} onClick={() => preview && void exportNode(preview)}>
              导出这个节点的产物
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => {
              if (!preview) return
              onText(`请重新生成「${preview.title}」对应的局部产物，只更新这个节点，不回退阶段，不影响其他资产。`)
              setPreview(null)
            }}>
              局部重生成
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

const ProjectWorkbench: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const { project, loading: projectLoading } = useProject(projectId)
  const { snapshot, loading, submitting, error, refresh, submitTurn } = useWorkspaceSnapshot(projectId)
  const [library, setLibrary] = useState<ProjectAssetLibraryRead | null>(null)

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    const loadLibrary = async () => {
      try {
        const res = await StudioProjectsService.getProjectAssetLibraryApiV1StudioProjectsProjectIdAssetLibraryGet({ projectId })
        if (!cancelled) setLibrary(res.data ?? null)
      } catch {
        if (!cancelled) setLibrary(null)
      }
    }
    void loadLibrary()
    return () => {
      cancelled = true
    }
  }, [projectId, snapshot?.revision])

  if (!projectId) {
    return <div className="flex h-[100dvh] items-center justify-center bg-black text-white">缺少项目 ID</div>
  }

  if (projectLoading && !project) {
    return <div className="flex h-[100dvh] items-center justify-center bg-black"><Spin /></div>
  }

  if (!project && !projectLoading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-black text-white">
        <Empty description={<span className="text-white/50">项目不存在</span>} />
      </div>
    )
  }

  return (
    <div className="h-[100dvh] min-h-0 bg-black text-white">
      {error ? <Alert className="absolute left-6 top-20 z-20 w-[360px]" type="warning" showIcon message={error} /> : null}
      {loading || submitting ? (
        <div className="pointer-events-none absolute left-1/2 top-6 z-20 -translate-x-1/2 rounded-full border border-white/12 bg-black px-4 py-2 text-xs text-white/72">
          {submitting ? 'Agent 正在提交…' : '正在刷新工作台…'}
        </div>
      ) : null}
      <ReactFlowProvider>
        <FlowInner
          projectId={projectId}
          snapshot={snapshot}
          library={library}
          onRefresh={() => void refresh()}
          agentLoading={loading}
          agentSubmitting={submitting}
          agentError={error}
          onChoice={(choiceId) => {
            void submitTurn({ type: 'choice', choice_id: choiceId })
          }}
          onText={(text) => {
            void submitTurn({ type: 'text', text })
          }}
        />
      </ReactFlowProvider>
    </div>
  )
}

export default ProjectWorkbench
