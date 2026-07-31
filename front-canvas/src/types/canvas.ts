/** 画布类型（第2层）：三种画布共用同一套外壳，仅"装什么内容"不同 */
export type CanvasType = 'aigc' | 'ecommerce' | 'custom'

/** 通用四种节点（§4，三种画布共用） */
export type GenericNodeKind = 'text' | 'image' | 'video' | 'audio'

/** 短剧 workflow 十种节点（业务附件第6批 §6） */
export type DramaNodeKind =
  | 'script'
  | 'character'
  | 'location'
  | 'prop'
  | 'storyboard'
  | 'shot_group'
  | 'keyframe'
  | 'shotlist_text'
  | 'shotlist_render'
  | 'video_shot'

/** 电商 workflow 节点（计划书 §12，草案） */
export type EcommerceNodeKind = 'product'

export type NodeKind = GenericNodeKind | DramaNodeKind | EcommerceNodeKind

export type NodeStatus = 'empty' | 'loading' | 'ready' | 'error'

/** 所有节点 data 的公共字段，与原则2/§5数据契约一致 */
export interface BaseNodeData {
  kind: NodeKind
  title: string
  subtitle?: string
  status: NodeStatus
  error?: string
  created_at: string
  seed?: number
  derived_from?: string
  pinned?: boolean
  cost?: { model?: string; tokens?: number; cny?: number }
  /** 每个节点自己的对话框状态（生成表单），切节点时互不干扰 */
  dialog?: Record<string, unknown>
  [key: string]: unknown
}

export const ASPECT_RATIOS = [
  'auto',
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '2:3',
  '3:2',
  '21:9',
] as const
export type AspectRatio = (typeof ASPECT_RATIOS)[number]

export const RESOLUTIONS = ['720p', '1080p', '2K', '4K'] as const
export type Resolution = (typeof RESOLUTIONS)[number]

/** 女娲真实模型清单（严禁模板占位名 Banana/Omni/Nodydance 等） */
export const TEXT_MODELS = [{ id: 'm-deepseek', label: 'DeepSeek', note: '剧本解析/提示词合成', ready: true }] as const

export const IMAGE_MODELS = [
  { id: 'seedream-5.0-pro', label: 'Seedream 5.0 Pro', note: '火山引擎 · 已接', ready: true },
  { id: 'seedream-5.0-lite', label: 'Seedream 5.0 Lite', note: '火山引擎 · 已接，更快更省', ready: true },
  { id: 'gpt-image-2', label: 'GPT-image 2', note: '待接入 key，暂不可用', ready: false },
  { id: 'midjourney', label: 'Midjourney', note: '待接入 key，暂不可用', ready: false },
] as const

export const VIDEO_MODELS = [
  { id: 'seedance-2.0', label: 'Seedance 2.0', note: '火山引擎 · 已接', ready: true },
  { id: 'seedance-2.0-fast', label: 'Seedance 2.0 Fast', note: '火山引擎 · 已接，速度优先', ready: true },
  { id: 'seedance-2.0-lite', label: 'Seedance 2.0 Lite', note: '火山引擎 · 已接，成本优先', ready: true },
  { id: 'kling-v3', label: 'Kling v3', note: '待接入 key，暂不可用', ready: false },
  { id: 'kling-v2.6', label: 'Kling v2.6', note: '待接入 key，暂不可用', ready: false },
] as const

export const AUDIO_MODELS = [
  { id: 'minimax-speech-2.8-hd', label: 'MiniMax Speech 2.8 HD', note: '女娲短剧配音主用 · 待接入 key', ready: false },
  { id: 'kling-text-to-sfx', label: 'Kling 文生音效', note: '待接入 key', ready: false },
  { id: 'suno-v5.5', label: 'Suno V5.5', note: '待接入 key', ready: false },
  { id: 'qwen3-tts-flash', label: 'Qwen3 TTS Flash', note: '待接入 key', ready: false },
  { id: 'qwen3-tts-instruct-flash', label: 'Qwen3 TTS Instruct Flash', note: '待接入 key', ready: false },
  { id: 'seed-audio-1.0', label: 'Seed Audio 1.0', note: '待接入 key', ready: false },
] as const

export const QUALITY_PRESETS = ['720p', '1080p', '4K'] as const
export const GEN_COUNTS = [1, 2, 4, 8] as const
export const VIDEO_DURATIONS = [4, 6, 8, 10] as const

export interface CameraPreset {
  key: string
  label: string
  hint: string
}

export const CAMERA_PRESETS: CameraPreset[] = [
  { key: 'grade', label: '电影级光影校正', hint: '统一色调与光比，画面更有电影感' },
  { key: 'push', label: '推镜头', hint: '引导观众视线，情感聚焦' },
  { key: 'pull', label: '拉镜头', hint: '交代环境，情绪舒缓/疏离' },
  { key: 'pan', label: '摇镜头', hint: '横向扫视空间，建立方位关系' },
  { key: 'tilt', label: '移镜头', hint: '横向平移跟随，展现空间纵深' },
  { key: 'follow', label: '跟镜头', hint: '贴身跟随人物，代入感强' },
  { key: 'fixed', label: '固定镜头', hint: '克制冷静，突出画面本身张力' },
  { key: 'orbit', label: '环拍镜头', hint: '环绕主体，展示立体感与仪式感' },
]

/** 图片生成 7 预设（业务附件§11.3，去 Banana/Omni 等模板占位） */
export const AIGC_IMAGE_PRESETS = [
  { key: 'character_three_view', label: '角色三视图' },
  { key: 'character_sheet', label: '角色设定图' },
  { key: 'scene_sheet', label: '场景设定图' },
  { key: 'product_sheet', label: '产品设定图' },
  { key: 'storyboard_page', label: '故事板' },
  { key: 'hand_drawn_storyboard', label: '手绘分镜表' },
  { key: 'grid25_storyboard', label: '25宫格分镜剧本' },
] as const

export const ECOMMERCE_IMAGE_PRESETS = [
  { key: 'product_sheet', label: '产品设定图（白底）' },
  { key: 'scene_composite', label: '场景图' },
  { key: 'multi_angle', label: '多角度' },
  { key: 'detail_page', label: '详情页' },
  { key: 'hero_image', label: '主图' },
  { key: 'marketing_poster', label: '营销海报' },
] as const
