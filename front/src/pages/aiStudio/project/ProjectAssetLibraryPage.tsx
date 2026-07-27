import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import {
  ArrowLeftOutlined,
  AudioOutlined,
  EnvironmentOutlined,
  FileTextOutlined,
  ReloadOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Alert, Button, Empty, Input, Modal, Skeleton, Space, Tag, Typography, message } from 'antd'
import { useNavigate, useParams } from 'react-router-dom'
import {
  StudioProjectsService,
  type AssetLibraryItemRead,
  type AssetLibraryReferenceImageRead,
  type AssetLibraryRelationRead,
  type ProjectAssetLibraryRead,
} from '../../../services/generated'
import { resolveAssetUrl } from '../asset-library/utils'

type NodeKind = 'character' | 'bible' | 'voice' | 'scene'

type CanvasNode = {
  id: string
  kind: NodeKind
  characterId: string
  title: string
  subtitle?: string
  imageUrl?: string
  referenceImages?: AssetLibraryReferenceImageRead[]
  bible?: Record<string, unknown>
  scene?: AssetLibraryItemRead
}

type CanvasLine = {
  id: string
  from: string
  to: string
}

type Point = {
  x: number
  y: number
}

type DragState = {
  nodeId: string
  offsetX: number
  offsetY: number
}

const NODE_SIZE: Record<NodeKind, { width: number; height: number }> = {
  character: { width: 240, height: 300 },
  bible: { width: 250, height: 170 },
  voice: { width: 210, height: 140 },
  scene: { width: 240, height: 170 },
}

const KIND_TONE: Record<NodeKind, string> = {
  character: 'border-zinc-900 bg-white',
  bible: 'border-sky-200 bg-sky-50/85',
  voice: 'border-violet-200 bg-violet-50/85',
  scene: 'border-emerald-200 bg-emerald-50/85',
}

const KIND_ICON: Record<NodeKind, JSX.Element> = {
  character: <UserOutlined />,
  bible: <FileTextOutlined />,
  voice: <AudioOutlined />,
  scene: <EnvironmentOutlined />,
}

function primaryImageUrl(item: AssetLibraryItemRead): string | undefined {
  const images = item.reference_images ?? []
  const primary = images.find((image) => image.is_primary) ?? images[0]
  return resolveAssetUrl(primary?.url || primary?.file_id)
}

function createTurnIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `asset_library_turn_${crypto.randomUUID()}`
  }
  return `asset_library_turn_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function bibleSummary(bible?: Record<string, unknown>): string {
  const anchors = asRecord(bible?.visual_anchors)
  const parts = [
    anchors.eye_shape ? `眼型 ${anchors.eye_shape}` : '',
    anchors.jawline ? `下颌 ${anchors.jawline}` : '',
    anchors.hairstyle ? `发型 ${anchors.hairstyle}` : '',
    anchors.clothing ? `服装 ${anchors.clothing}` : '',
  ].filter(Boolean)
  return parts.join(' / ') || String(bible?.identity || '待补充角色圣经')
}

function voiceSummary(bible?: Record<string, unknown>): string {
  const voice = bible?.voice
  return typeof voice === 'string' && voice.trim() ? voice.trim() : '音色卡占位，音频批次接入'
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function accessoryText(bible?: Record<string, unknown>): string {
  const rawAccessories = bible?.wearable_accessories
  const accessories: unknown[] = Array.isArray(rawAccessories) ? rawAccessories : []
  return accessories
    .map((item) => {
      const row = asRecord(item)
      return [row.name, row.placement].filter(Boolean).join(' @ ')
    })
    .filter(Boolean)
    .join('；')
}

function sceneRelations(item: AssetLibraryItemRead): AssetLibraryRelationRead[] {
  return (item.relations ?? []).filter((relation) => relation.relation_type === 'appears_in_scene')
}

function buildCanvas(library: ProjectAssetLibraryRead | null): {
  nodes: CanvasNode[]
  lines: CanvasLine[]
  positions: Record<string, Point>
} {
  if (!library) return { nodes: [], lines: [], positions: {} }
  const scenesById = new Map((library.scenes ?? []).map((scene) => [scene.id, scene]))
  const nodes: CanvasNode[] = []
  const lines: CanvasLine[] = []
  const positions: Record<string, Point> = {}

  ;(library.characters ?? []).forEach((character, index) => {
    const rowTop = 48 + index * 360
    const characterId = `character:${character.id}`
    const bibleId = `bible:${character.id}`
    const voiceId = `voice:${character.id}`
    const sceneId = `scene:${character.id}`
    const relatedScene =
      sceneRelations(character)
        .map((relation) => scenesById.get(relation.target_id))
        .find(Boolean) ?? (library.scenes ?? [])[0]

    nodes.push(
      {
        id: characterId,
        kind: 'character',
        characterId: character.id,
        title: character.name,
        subtitle: character.description,
        imageUrl: primaryImageUrl(character),
        referenceImages: character.reference_images ?? [],
        bible: character.bible,
      },
      {
        id: bibleId,
        kind: 'bible',
        characterId: character.id,
        title: `${character.name} · 圣经`,
        subtitle: bibleSummary(character.bible),
        bible: character.bible,
      },
      {
        id: voiceId,
        kind: 'voice',
        characterId: character.id,
        title: `${character.name} · 音色`,
        subtitle: voiceSummary(character.bible),
        bible: character.bible,
      },
      {
        id: sceneId,
        kind: 'scene',
        characterId: character.id,
        title: relatedScene?.name || '所属场景',
        subtitle: relatedScene?.description || '暂无镜头场景关系',
        imageUrl: relatedScene ? primaryImageUrl(relatedScene) : undefined,
        referenceImages: relatedScene?.reference_images ?? [],
        scene: relatedScene,
      },
    )
    lines.push(
      { id: `${character.id}:bible`, from: characterId, to: bibleId },
      { id: `${character.id}:voice`, from: characterId, to: voiceId },
      { id: `${character.id}:scene`, from: characterId, to: sceneId },
    )
    positions[characterId] = { x: 56, y: rowTop }
    positions[bibleId] = { x: 360, y: rowTop + 12 }
    positions[voiceId] = { x: 690, y: rowTop + 22 }
    positions[sceneId] = { x: 960, y: rowTop + 12 }
  })

  return { nodes, lines, positions }
}

function linePoint(node: CanvasNode, point: Point, side: 'left' | 'right'): Point {
  const size = NODE_SIZE[node.kind]
  return {
    x: point.x + (side === 'right' ? size.width : 0),
    y: point.y + size.height / 2,
  }
}

function nodeStyle(node: CanvasNode, position: Point): CSSProperties {
  const size = NODE_SIZE[node.kind]
  return {
    width: size.width,
    height: size.height,
    transform: `translate(${position.x}px, ${position.y}px)`,
  }
}

const ProjectAssetLibraryPage = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [library, setLibrary] = useState<ProjectAssetLibraryRead | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [positions, setPositions] = useState<Record<string, Point>>({})
  const [dragging, setDragging] = useState<DragState | null>(null)
  const [previewNode, setPreviewNode] = useState<CanvasNode | null>(null)
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)
  const [regenerateInstruction, setRegenerateInstruction] = useState('')
  const [regenerateSubmitting, setRegenerateSubmitting] = useState(false)

  const canvas = useMemo(() => buildCanvas(library), [library])
  const nodesById = useMemo(() => new Map(canvas.nodes.map((node) => [node.id, node])), [canvas.nodes])
  const canvasHeight = Math.max(620, 80 + (library?.characters?.length ?? 0) * 360)

  useEffect(() => {
    setPositions(canvas.positions)
  }, [canvas.positions])

  useEffect(() => {
    let cancelled = false
    if (!projectId) return
    setLoading(true)
    setError(null)
    StudioProjectsService.getProjectAssetLibraryApiV1StudioProjectsProjectIdAssetLibraryGet({ projectId })
      .then((res) => {
        if (!cancelled) setLibrary(res.data ?? null)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '资产库加载失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  const handlePointerDown = (nodeId: string, event: ReactPointerEvent<HTMLDivElement>) => {
    const current = positions[nodeId]
    if (!current) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging({
      nodeId,
      offsetX: event.clientX - current.x,
      offsetY: event.clientY - current.y,
    })
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    setPositions((prev) => ({
      ...prev,
      [dragging.nodeId]: {
        x: Math.max(24, event.clientX - dragging.offsetX),
        y: Math.max(24, event.clientY - dragging.offsetY),
      },
    }))
  }

  const characterForPreview = previewNode
    ? canvas.nodes.find((node) => node.kind === 'character' && node.characterId === previewNode.characterId)
    : null
  const previewReferenceImages = characterForPreview?.referenceImages ?? previewNode?.referenceImages ?? []
  const activePreviewImageUrl = previewImageUrl || characterForPreview?.imageUrl || previewNode?.imageUrl || null

  useEffect(() => {
    setPreviewImageUrl(null)
    setRegenerateInstruction('')
  }, [previewNode?.id])

  const submitRegenerateTurn = async () => {
    if (!projectId || !previewNode) return
    const instruction = regenerateInstruction.trim()
    if (!instruction) {
      message.warning('请输入局部重生成要求')
      return
    }
    setRegenerateSubmitting(true)
    try {
      const snapshot = await StudioProjectsService.getProjectWorkspaceApiV1StudioProjectsProjectIdWorkspaceGet({ projectId })
      const data = snapshot.data
      if (!data?.session_id) {
        message.error('当前项目没有可用 Agent session')
        return
      }
      await StudioProjectsService.handleProjectAgentTurnApiV1StudioProjectsProjectIdAgentTurnsPost({
        projectId,
        requestBody: {
          session_id: data.session_id,
          expected_revision: data.revision,
          idempotency_key: createTurnIdempotencyKey(),
          input: {
            type: 'text',
            text: `局部重生成角色「${previewNode.title}」（target=${previewNode.characterId}）：${instruction}`,
          },
        },
      })
      message.success('已提交局部重生成请求，回到工作台查看进度')
      navigate(`/projects/${projectId}`)
    } catch (err) {
      message.error(err instanceof Error ? err.message : '局部重生成提交失败')
    } finally {
      setRegenerateSubmitting(false)
    }
  }

  return (
    <div className="nuwa-asset-library min-h-full bg-black text-white">
      <div className="sticky top-0 z-20 border-b border-white/[.08] bg-black/85 px-6 py-4 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(projectId ? `/projects/${projectId}` : '/projects')} />
            <div>
              <Typography.Title level={4} className="!mb-0">
                项目资产库
              </Typography.Title>
              <Typography.Text className="!text-white/50">角色四视图、圣经、音色占位与所属场景关系</Typography.Text>
            </div>
          </Space>
          <Button
            onClick={() => {
              setPositions(canvas.positions)
            }}
          >
            重置布局
          </Button>
        </div>
      </div>

      <div className="p-6">
        {error ? <Alert type="error" showIcon message="资产库加载失败" description={error} /> : null}
        {loading ? <Skeleton active paragraph={{ rows: 10 }} /> : null}
        {!loading && !error && canvas.nodes.length === 0 ? <Empty description="当前项目暂无角色资产" /> : null}

        {!loading && !error && canvas.nodes.length > 0 ? (
          <div className="overflow-auto rounded-lg border border-white/[.10] bg-white/[.04] shadow-sm">
            <div
              className="relative min-w-[1240px]"
              style={{ height: canvasHeight }}
              onPointerMove={handlePointerMove}
              onPointerUp={() => setDragging(null)}
              onPointerCancel={() => setDragging(null)}
            >
              <svg className="pointer-events-none absolute inset-0 h-full w-full">
                {canvas.lines.map((line) => {
                  const from = nodesById.get(line.from)
                  const to = nodesById.get(line.to)
                  const fromPos = positions[line.from]
                  const toPos = positions[line.to]
                  if (!from || !to || !fromPos || !toPos) return null
                  const start = linePoint(from, fromPos, 'right')
                  const end = linePoint(to, toPos, 'left')
                  const mid = Math.max(72, (end.x - start.x) / 2)
                  return (
                    <path
                      key={line.id}
                      d={`M ${start.x} ${start.y} C ${start.x + mid} ${start.y}, ${end.x - mid} ${end.y}, ${end.x} ${end.y}`}
                      fill="none"
                      stroke="rgba(255,255,255,.34)"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  )
                })}
              </svg>

              {canvas.nodes.map((node) => {
                const position = positions[node.id] ?? { x: 0, y: 0 }
                return (
                  <div
                    key={node.id}
                    data-testid={`asset-node-${node.kind}-${node.characterId}`}
                    className={`absolute cursor-grab rounded-lg border shadow-sm transition-shadow active:cursor-grabbing ${KIND_TONE[node.kind]}`}
                    style={nodeStyle(node, position)}
                    onPointerDown={(event) => handlePointerDown(node.id, event)}
                    onDoubleClick={() => setPreviewNode(node)}
                  >
                    <div className="flex h-full flex-col p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="min-w-0 font-semibold text-zinc-950">
                          <span className="mr-1.5 text-zinc-500">{KIND_ICON[node.kind]}</span>
                          <span className="truncate align-middle">{node.title}</span>
                        </div>
                        <Tag className="m-0" color={node.kind === 'character' ? 'default' : 'blue'}>
                          {node.kind === 'character' ? '角色' : node.kind === 'bible' ? '圣经' : node.kind === 'voice' ? '音色' : '场景'}
                        </Tag>
                      </div>
                      {node.kind === 'character' ? (
                        <button
                          type="button"
                          data-testid={`asset-node-preview-${node.characterId}`}
                          className="mb-2 flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-md border border-black/10 bg-white p-1"
                          onClick={(event) => {
                            event.stopPropagation()
                            setPreviewNode(node)
                          }}
                        >
                          {node.imageUrl ? (
                            <img src={node.imageUrl} alt={node.title} className="h-full w-full object-contain" />
                          ) : (
                            <span className="text-sm text-zinc-400">暂无四视图</span>
                          )}
                        </button>
                      ) : null}
                      {node.kind === 'scene' && node.imageUrl ? (
                        <div className="mb-2 h-16 overflow-hidden rounded-md border border-black/10 bg-white">
                          <img src={node.imageUrl} alt={node.title} className="h-full w-full object-cover" />
                        </div>
                      ) : null}
                      <div className="line-clamp-4 text-xs leading-5 text-zinc-600">{node.subtitle}</div>
                      {node.kind === 'bible' ? <div className="mt-auto text-[11px] text-sky-700">{accessoryText(node.bible) || '穿戴配饰：无'}</div> : null}
                      {node.kind !== 'character' ? (
                        <Button
                          size="small"
                          className="mt-auto self-start"
                          onClick={(event) => {
                            event.stopPropagation()
                            setPreviewNode(node)
                          }}
                        >
                          预览
                        </Button>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>

      <Modal
        title={previewNode?.title}
        open={Boolean(previewNode)}
        onCancel={() => setPreviewNode(null)}
        footer={null}
        width={1080}
        destroyOnClose
      >
        {previewNode ? (
          <div className="grid gap-5 md:grid-cols-[420px_1fr]">
            <div className="rounded-lg border border-black/10 bg-zinc-50 p-3">
              {activePreviewImageUrl ? (
                <img src={activePreviewImageUrl} alt={previewNode.title} className="max-h-[70vh] w-full object-contain" />
              ) : (
                <div className="flex h-72 items-center justify-center text-zinc-400">暂无四视图</div>
              )}
              {previewReferenceImages.length ? (
                <div className="mt-3">
                  <div className="mb-2 text-xs font-semibold text-zinc-500">版本槽位</div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {previewReferenceImages.map((image, index) => {
                      const url = resolveAssetUrl(image.url || image.file_id)
                      if (!url) return null
                      return (
                        <button
                          key={`${image.file_id ?? image.url ?? index}`}
                          type="button"
                          className={`h-16 w-12 shrink-0 overflow-hidden rounded-md border bg-white p-0 ${
                            activePreviewImageUrl === url ? 'border-zinc-950' : 'border-black/10'
                          }`}
                          onClick={() => setPreviewImageUrl(url)}
                        >
                          <img src={url} alt={`版本 ${index + 1}`} className="h-full w-full object-cover" />
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="min-w-0 space-y-4">
              <div>
                <Typography.Title level={5} className="!mb-1">
                  完整角色圣经
                </Typography.Title>
                <Typography.Text type="secondary">用于跨集复用的结构化角色锚点</Typography.Text>
              </div>
              <pre className="max-h-[52vh] overflow-auto rounded-md bg-zinc-950 p-4 text-xs leading-5 text-zinc-100">
                {JSON.stringify(previewNode.bible ?? {}, null, 2)}
              </pre>
              <div className="rounded-lg border border-black/10 bg-white p-4">
                <Typography.Title level={5} className="!mb-1">
                  局部重生成
                </Typography.Title>
                <Typography.Text type="secondary">
                  只为该角色生成新版本图，不回退阶段，不影响其他元素。
                </Typography.Text>
                <Input.TextArea
                  className="mt-3"
                  value={regenerateInstruction}
                  onChange={(event) => setRegenerateInstruction(event.target.value)}
                  autoSize={{ minRows: 2, maxRows: 4 }}
                  placeholder="例如：女主不好看，换清冷点；胸针更明显但仍别在胸前"
                />
              </div>
              <Space wrap>
                <Button
                  type="primary"
                  icon={<ReloadOutlined />}
                  loading={regenerateSubmitting}
                  onClick={() => void submitRegenerateTurn()}
                >
                  提交局部重生成
                </Button>
                <Button onClick={() => setPreviewNode(null)}>关闭</Button>
              </Space>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}

export default ProjectAssetLibraryPage
