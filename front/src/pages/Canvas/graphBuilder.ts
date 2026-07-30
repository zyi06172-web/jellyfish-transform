import type { Edge, Node } from '@xyflow/react'
import type {
  AgentWorkspaceSnapshotRead,
  AssetLibraryItemRead,
  ProjectAssetLibraryRead,
} from '../../services/generated'
import {
  DEFAULT_CANVAS_RATIO,
  type CanvasNodeType,
  type CanvasNodeStatus,
  type NuwaCanvasNodeData,
  type ShotlistTextRow,
} from './types'

type PositionFor = (type: CanvasNodeType, index: number) => { x: number; y: number }

function nowIso() {
  return new Date().toISOString()
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function latestArtifact(snapshot: AgentWorkspaceSnapshotRead | null, kind: string) {
  const artifacts = Object.values(snapshot?.artifacts ?? {}) as Array<{
    kind?: string
    version?: number
    content_text?: string
    content_json?: Record<string, unknown>
  }>
  return artifacts
    .filter((artifact) => artifact.kind === kind)
    .sort((left, right) => Number(right.version ?? 0) - Number(left.version ?? 0))[0]
}

function imageByAngle(asset: AssetLibraryItemRead, keywords: string[], fallbackIndex: number) {
  const images = asset.reference_images ?? []
  const matched = images.find((image) => {
    const angle = image.view_angle.toLowerCase()
    return keywords.some((keyword) => angle.includes(keyword))
  })
  return matched?.url || images[fallbackIndex]?.url
}

function compactNameList(items?: AssetLibraryItemRead[]) {
  return (items ?? []).map((item) => item.name).filter(Boolean)
}

function storyText(artifact?: ReturnType<typeof latestArtifact>) {
  const content = asObject(artifact?.content_json)
  return String(artifact?.content_text || content.raw_script || '')
}

function normalizedStoryboard(snapshot: AgentWorkspaceSnapshotRead | null) {
  const artifact = latestArtifact(snapshot, 'storyboard')
  const content = asObject(artifact?.content_json)
  const pages = Array.isArray(content.pages) ? content.pages : []
  const page = pages.find((item) => item && typeof item === 'object')
  if (page) return { pages: [page as Record<string, unknown>] }

  const candidateLists = [content.shots, content.shot_divisions, content.items, content.storyboard]
  const shots = candidateLists.find((item) => Array.isArray(item)) as unknown[] | undefined
  if (!shots?.length) return undefined
  const panels = Array.from({ length: 6 }, (_, index) => {
    if (index === 5) return { index: 6, one_sentence_summary: '', is_blank: true }
    const source = asObject(shots[index])
    return {
      index: index + 1,
      one_sentence_summary: String(
        source.one_sentence_summary
        || source.visible_summary
        || source.summary
        || source.title
        || source.original_text
        || `镜头 ${index + 1}`,
      ),
      six_elements_for_video_model: asObject(source.six_elements_for_video_model || source.six_elements),
      duration: Number(source.duration || source.duration_seconds || 1),
    }
  })
  const hasLongShot = panels.some((panel) => !panel.is_blank && Number(panel.duration || 1) > 5)
  return {
    pages: [{
      layout: '2_rows_x_3_columns',
      panel_count: 6,
      blank_panel_index: 6,
      panels,
      duration_warning: hasLongShot,
    }],
  }
}

function arrayFromArtifact(snapshot: AgentWorkspaceSnapshotRead | null, kind: string, key: string) {
  const artifact = latestArtifact(snapshot, kind)
  const value = artifact?.content_json?.[key]
  return Array.isArray(value) ? value as Record<string, unknown>[] : []
}

function keyframeFrames(snapshot: AgentWorkspaceSnapshotRead | null) {
  return arrayFromArtifact(snapshot, 'keyframe', 'frames').map((frame, index) => ({
    panel_index: Number(frame.panel_index || index + 1),
    url: typeof frame.url === 'string' ? frame.url : undefined,
    seed: typeof frame.seed === 'number' ? frame.seed : undefined,
    status: ((frame.status === 'ready' || frame.status === 'error' || frame.status === 'loading') ? frame.status : 'loading') as CanvasNodeStatus,
    task_id: typeof frame.task_id === 'string' ? frame.task_id : undefined,
  }))
}

function shotlistTextRows(snapshot: AgentWorkspaceSnapshotRead | null): ShotlistTextRow[] {
  return arrayFromArtifact(snapshot, 'shotlist_text', 'rows').map((row, index) => ({
    panel_index: Number(row.panel_index || index + 1),
    one_sentence_summary: String(row.one_sentence_summary || `格 ${index + 1}`),
    six_elements_for_video_model: asObject(row.six_elements_for_video_model),
    emotion: typeof row.emotion === 'string' ? row.emotion : undefined,
    action_beats: Array.isArray(row.action_beats) ? row.action_beats.map(String) : [],
    motion_design: asObject(row.motion_design),
  }))
}

function shotlistRenderRows(snapshot: AgentWorkspaceSnapshotRead | null) {
  return arrayFromArtifact(snapshot, 'shotlist_render', 'rows').map((row, index) => ({
    panel_index: Number(row.panel_index || index + 1),
    frame_url: typeof row.frame_url === 'string' ? row.frame_url : undefined,
    movement: typeof row.movement === 'string' ? row.movement : undefined,
    camera_shot: typeof row.camera_shot === 'string' ? row.camera_shot : undefined,
    emotion: typeof row.emotion === 'string' ? row.emotion : undefined,
    action_beats: Array.isArray(row.action_beats) ? row.action_beats.map(String) : [],
    atmosphere: typeof row.atmosphere === 'string' ? row.atmosphere : undefined,
  }))
}

function videoPayload(snapshot: AgentWorkspaceSnapshotRead | null) {
  return arrayFromArtifact(snapshot, 'video', 'videos')[0]
}

function isWearableProp(asset: AssetLibraryItemRead) {
  const bible = asObject(asset.bible)
  const text = `${asset.name} ${asset.description || ''}`.toLowerCase()
  return bible.is_wearable === true || text.includes('wearable') || text.includes('穿戴') || text.includes('配饰')
}

export function savedLooksLikeBatch6(nodes?: Node[]) {
  const nodeTypesInState = new Set((nodes ?? []).map((node) => node.type))
  return nodeTypesInState.has('script') && nodeTypesInState.has('video')
}

export function persistableNodes(nodes: Node<NuwaCanvasNodeData>[]) {
  return nodes.map((node) => {
    const { __ops: _ops, ...data } = node.data
    return { ...node, data }
  })
}

export function mergeBackendGraph(
  savedNodes: Node<NuwaCanvasNodeData>[],
  savedEdges: Edge[],
  backendNodes: Node<NuwaCanvasNodeData>[],
  backendEdges: Edge[],
) {
  const backendById = new Map(backendNodes.map((node) => [node.id, node]))
  const hasReadyCharacter = backendNodes.some((node) => node.type === 'character' && node.data.status === 'ready')
  const hasReadyLocation = backendNodes.some((node) => node.type === 'location' && node.data.status === 'ready')
  const hasReadyProp = backendNodes.some((node) => node.type === 'prop' && node.data.status === 'ready')
  const shouldDropPlaceholder = (node: Node<NuwaCanvasNodeData>) => (
    (node.id === 'character:empty' && hasReadyCharacter)
    || (node.id === 'location:empty' && hasReadyLocation)
    || (node.id === 'prop:empty' && hasReadyProp)
  ) && node.data.status === 'empty' && !node.data.pinned

  const mergedNodes = savedNodes
    .filter((node) => !shouldDropPlaceholder(node))
    .map((node) => {
      const backend = backendById.get(node.id)
      if (!backend) return node
      return { ...node, data: { ...backend.data, pinned: node.data.pinned, __ops: node.data.__ops } }
    })
  const existingIds = new Set(mergedNodes.map((node) => node.id))
  for (const backendNode of backendNodes) {
    if (!existingIds.has(backendNode.id)) mergedNodes.push(backendNode)
  }
  const validIds = new Set(mergedNodes.map((node) => node.id))
  const edgeById = new Map(savedEdges.filter((edge) => validIds.has(edge.source) && validIds.has(edge.target)).map((edge) => [edge.id, edge]))
  for (const edge of backendEdges) {
    if (validIds.has(edge.source) && validIds.has(edge.target) && !edgeById.has(edge.id)) edgeById.set(edge.id, edge)
  }
  return { nodes: mergedNodes, edges: Array.from(edgeById.values()) }
}

export function buildInitialGraph({
  projectId,
  canvasId,
  aspectRatio,
  library,
  snapshot,
  projectSeed,
  positionFor,
}: {
  projectId: string
  canvasId: string
  aspectRatio?: string
  library: ProjectAssetLibraryRead | null
  snapshot: AgentWorkspaceSnapshotRead | null
  projectSeed?: number | null
  positionFor: PositionFor
}) {
  const ratio = aspectRatio || DEFAULT_CANVAS_RATIO
  const storyArtifact = latestArtifact(snapshot, 'story_summary')
  const storyboardArtifact = latestArtifact(snapshot, 'storyboard')
  const shotlistTextArtifact = latestArtifact(snapshot, 'shotlist_text')
  const keyframeArtifact = latestArtifact(snapshot, 'keyframe')
  const shotlistRenderArtifact = latestArtifact(snapshot, 'shotlist_render')
  const videoArtifact = latestArtifact(snapshot, 'video')
  const storyContent = asObject(storyArtifact?.content_json)
  const storyboardContent = normalizedStoryboard(snapshot)
  const frames = keyframeFrames(snapshot)
  const textRows = shotlistTextRows(snapshot)
  const renderRows = shotlistRenderRows(snapshot)
  const video = videoPayload(snapshot)
  const characters = library?.characters ?? []
  const scenes = library?.scenes ?? []
  const props = library?.props ?? []
  const base = { project_id: projectId, canvas_id: canvasId, status: 'empty' as const, created_at: nowIso() }

  const characterNodes = (characters.length ? characters : [undefined]).map((character, index) => ({
    id: character ? `character:${character.id}` : 'character:empty',
    type: 'character',
    position: positionFor('character', index),
    data: {
      ...base,
      status: character ? 'ready' as const : 'empty' as const,
      name: character?.name || '待生成角色',
      character_id: character?.id,
      bible_json: character?.bible,
      reference_layout: 'four_view' as const,
      linked_existing: false,
      images: character ? {
        face_closeup: imageByAngle(character, ['face', 'close', 'head', '脸', '特写'], 0),
        full_front: imageByAngle(character, ['front', '正'], 1),
        full_side: imageByAngle(character, ['side', '侧'], 2),
        full_back: imageByAngle(character, ['back', '背'], 3),
      } : {},
    },
  })) satisfies Node<NuwaCanvasNodeData>[]

  const locationNodes = (scenes.length ? scenes : [undefined]).map((scene, index) => ({
    id: scene ? `location:${scene.id}` : 'location:empty',
    type: 'location',
    position: positionFor('location', index),
    data: {
      ...base,
      status: scene ? 'ready' as const : 'empty' as const,
      name: scene?.name || '待生成场景',
      location_id: scene?.id,
      mood: scene?.description,
      subtitle: ratio,
      images: scene?.reference_images?.map((item) => item.url).filter(Boolean) ?? [],
    },
  })) satisfies Node<NuwaCanvasNodeData>[]

  const propNodes = (props.length ? props : [undefined]).map((prop, index) => {
    const wearable = prop ? isWearableProp(prop) : false
    return {
      id: prop ? `prop:${prop.id}` : 'prop:empty',
      type: 'prop',
      position: positionFor('prop', index),
      data: {
        ...base,
        status: prop ? 'ready' as const : 'empty' as const,
        name: prop?.name || '待生成道具',
        prop_id: prop?.id,
        is_wearable: wearable,
        image: wearable ? undefined : prop?.reference_images?.[0]?.url,
        character_node_id: wearable && characters[0] ? `character:${characters[0].id}` : undefined,
      },
    }
  }) satisfies Node<NuwaCanvasNodeData>[]

  const nodes: Node<NuwaCanvasNodeData>[] = [
    {
      id: 'script',
      type: 'script',
      position: positionFor('script', 0),
      data: {
        ...base,
        status: storyArtifact ? 'ready' : 'empty',
        title: '剧本 · 第1章',
        raw_script: storyText(storyArtifact),
        parsed: {
          story_structure: storyContent.story_structure || storyContent.final_video_spec || storyContent,
          characters: compactNameList(library?.characters),
          shots_info: storyboardArtifact?.content_json,
        },
      },
    },
    ...characterNodes,
    ...locationNodes,
    ...propNodes,
    {
      id: 'storyboard',
      type: 'storyboard',
      position: positionFor('storyboard', 0),
      data: { ...base, status: storyboardContent ? 'ready' : 'empty', content_json: storyboardContent },
    },
    { id: 'shot_group', type: 'shot_group', position: positionFor('shot_group', 0), data: { ...base, shots: [] } },
    {
      id: 'shotlist_text',
      type: 'shotlist_text',
      position: positionFor('shotlist_text', 1),
      data: { ...base, status: shotlistTextArtifact ? 'ready' : 'empty', rows: textRows },
    },
    {
      id: 'keyframe',
      type: 'keyframe',
      position: positionFor('keyframe', 0),
      data: { ...base, status: keyframeArtifact ? (frames.some((frame) => frame.status === 'loading') ? 'loading' : 'ready') : 'empty', seed: Number(keyframeArtifact?.content_json?.seed || projectSeed || 0), frames },
    },
    {
      id: 'shotlist_render',
      type: 'shotlist_render',
      position: positionFor('shotlist_render', 0),
      data: { ...base, status: shotlistRenderArtifact ? 'ready' : 'empty', rows: renderRows },
    },
    {
      id: 'video',
      type: 'video',
      position: positionFor('video', 0),
      data: {
        ...base,
        status: videoArtifact ? 'ready' : 'empty',
        aspect_ratio: String(video?.aspect_ratio || ratio),
        url: typeof video?.url === 'string' ? video.url : undefined,
        duration: typeof video?.duration === 'number' ? video.duration : undefined,
        resolution: typeof video?.resolution === 'string' ? video.resolution : undefined,
        shot_index: typeof video?.shot_index === 'number' ? video.shot_index : undefined,
        prompt_used: typeof video?.prompt_used === 'string' ? video.prompt_used : undefined,
      },
    },
  ]

  const edges: Edge[] = [
    ...characterNodes.map((node) => ({ id: `script-${node.id}`, source: 'script', target: node.id })),
    ...locationNodes.map((node) => ({ id: `script-${node.id}`, source: 'script', target: node.id })),
    ...propNodes.map((node) => ({ id: `script-${node.id}`, source: 'script', target: node.id })),
    ...characterNodes.filter((node) => node.data.status === 'ready').map((node) => ({ id: `${node.id}-storyboard`, source: node.id, target: 'storyboard' })),
    ...locationNodes.filter((node) => node.data.status === 'ready').map((node) => ({ id: `${node.id}-storyboard`, source: node.id, target: 'storyboard' })),
    ...propNodes.filter((node) => node.data.status === 'ready').map((node) => ({ id: `${node.id}-storyboard`, source: node.id, target: 'storyboard' })),
    { id: 'script-storyboard', source: 'script', target: 'storyboard', animated: true },
    { id: 'storyboard-shotlist-text', source: 'storyboard', target: 'shotlist_text', animated: true },
    { id: 'storyboard-shot-group', source: 'storyboard', target: 'shot_group', animated: true },
    { id: 'shotlist-text-keyframe', source: 'shotlist_text', target: 'keyframe', animated: true },
    { id: 'keyframe-shotlist-render', source: 'keyframe', target: 'shotlist_render', animated: true },
    { id: 'shotlist-render-video', source: 'shotlist_render', target: 'video', animated: true },
  ]
  return { nodes, edges }
}

export function previewRowsFromNodes(nodes: Node<NuwaCanvasNodeData>[]): ShotlistTextRow[] {
  const readyRows = nodes.find((node) => node.type === 'shotlist_text')?.data
  if (readyRows && 'rows' in readyRows && Array.isArray(readyRows.rows) && readyRows.rows.length) {
    return readyRows.rows as ShotlistTextRow[]
  }
  const storyboard = nodes.find((node) => node.type === 'storyboard')?.data
  const panels = storyboard && 'content_json' in storyboard ? storyboard.content_json?.pages?.[0]?.panels ?? [] : []
  return panels
    .filter((panel) => !panel.is_blank)
    .filter((_panel, index) => index < 5)
    .map((panel, index) => ({
      panel_index: panel.index || index + 1,
      one_sentence_summary: panel.one_sentence_summary || `格 ${index + 1}`,
      six_elements_for_video_model: panel.six_elements_for_video_model ?? {},
      emotion: '待审',
      action_beats: [],
      motion_design: {
        follow_subject: '主体',
        route: panel.one_sentence_summary || '按当前格动作推进',
        spatial_explanation: '保持项目比例内的清晰空间关系',
        relationship_change: '主体关系按动作节拍变化',
        pause_point: '动作完成处短暂停顿',
        ending_information: panel.one_sentence_summary || '释放本格结果信息',
      },
    }))
}
