import type { NodeKind } from './canvas'

/** 预设工作流里的一个节点：col/row 决定铺开时的网格落位，data 是预置到 node.data 的内容。 */
export interface PresetNode {
  localId: string
  kind: NodeKind
  col: number
  row: number
  data: Record<string, unknown>
}

export interface PresetEdge {
  from: string
  to: string
}

export interface WorkflowPreset {
  id: string
  name: string
  description: string
  /** 卡片封面用的强调色 */
  accent: string
  nodes: PresetNode[]
  edges: PresetEdge[]
}

/** 电商各生图节点的专业英文摄影 prompt（photorealistic commercial fashion photography）。
 *  走火山 Seedream（model=seedream-5.0-pro），复用通用图片节点的真实生图链路。 */
function ecomImage(localId: string, col: number, row: number, title: string, prompt: string): PresetNode {
  return {
    localId,
    kind: 'image',
    col,
    row,
    data: {
      title,
      dialog: { prompt, model: 'seedream-5.0-pro', ratio: '3:4', quality: '1080p', count: 1, preset: 'product_sheet' },
    },
  }
}

const SHORT_DRAMA: WorkflowPreset = {
  id: 'short_drama',
  name: '短剧工作流',
  description: '剧本 → 角色/场景/道具 → 手绘故事板 → 文字分镜表 → 关键帧 → 渲染分镜表 → 视频。铺开后用左下女娲 Agent 贴剧本推进，成本闸门在渲染/出视频前保留。',
  accent: '#0a84ff',
  nodes: [
    { localId: 'script', kind: 'script', col: 0, row: 1, data: { title: '剧本' } },
    { localId: 'character', kind: 'character', col: 1, row: 0, data: { title: '角色资产' } },
    { localId: 'location', kind: 'location', col: 1, row: 1, data: { title: '场景资产' } },
    { localId: 'prop', kind: 'prop', col: 1, row: 2, data: { title: '道具资产' } },
    { localId: 'script_breakdown', kind: 'script_breakdown', col: 2, row: 1, data: { title: '分镜脚本生成' } },
    { localId: 'storyboard', kind: 'storyboard', col: 3, row: 1, data: { title: '手绘故事板' } },
    { localId: 'shotlist_text', kind: 'shotlist_text', col: 4, row: 1, data: { title: '分镜表（文字版）' } },
    { localId: 'keyframe', kind: 'keyframe', col: 5, row: 1, data: { title: '关键帧渲染' } },
    { localId: 'shotlist_render', kind: 'shotlist_render', col: 6, row: 1, data: { title: '分镜表（渲染版）' } },
    { localId: 'video', kind: 'video_shot', col: 7, row: 1, data: { title: '视频' } },
  ],
  edges: [
    { from: 'script', to: 'character' },
    { from: 'script', to: 'location' },
    { from: 'script', to: 'prop' },
    { from: 'script', to: 'script_breakdown' },
    { from: 'character', to: 'script_breakdown' },
    { from: 'location', to: 'script_breakdown' },
    { from: 'prop', to: 'script_breakdown' },
    { from: 'character', to: 'storyboard' },
    { from: 'location', to: 'storyboard' },
    { from: 'prop', to: 'storyboard' },
    { from: 'script_breakdown', to: 'storyboard' },
    { from: 'storyboard', to: 'shotlist_text' },
    { from: 'shotlist_text', to: 'keyframe' },
    { from: 'keyframe', to: 'shotlist_render' },
    { from: 'shotlist_render', to: 'video' },
  ],
}

const ECOMMERCE: WorkflowPreset = {
  id: 'ecommerce_amazon_aplus',
  name: '服装 · 亚马逊 A+ 详情',
  description: '服装电商详情页素材自动生产线：上传原图 + 产品信息 → 场景分析 → 场景图/卖点图/细节图/尺码图 → 整套 A+ 素材。每个生图节点预置专业英文电商摄影 prompt，走火山 Seedream 真出图。',
  accent: '#ff8f3c',
  nodes: [
    { localId: 'product', kind: 'product', col: 0, row: 1, data: { title: '服装商品（上传原图 + 品名/面料）' } },
    {
      localId: 'scene_analysis',
      kind: 'text',
      col: 1,
      row: 1,
      data: {
        title: '场景视觉分析',
        text: '基于服装的材质、版型、目标人群，规划 3 组使用场景（如：都市通勤 / 周末度假 / 居家休闲），并为每组给出光线、背景、模特姿态建议，供下游场景图节点参照。',
      },
    },
    ecomImage(
      'scene1',
      2,
      0,
      '场景图1 · 都市通勤',
      'Photorealistic commercial fashion photography of a model wearing the garment, urban commute scene, modern city street with soft morning light, natural candid pose, shallow depth of field, editorial lifestyle look, high detail on fabric texture, 3:4.',
    ),
    ecomImage(
      'scene2',
      2,
      1,
      '场景图2 · 周末度假',
      'Photorealistic commercial fashion photography of a model wearing the garment, weekend getaway scene, sunny seaside or park background, relaxed joyful pose, warm golden-hour light, lifestyle editorial style, crisp fabric detail, 3:4.',
    ),
    ecomImage(
      'scene3',
      2,
      2,
      '场景图3 · 居家休闲',
      'Photorealistic commercial fashion photography of a model wearing the garment, cozy home interior scene, soft diffused indoor light, calm comfortable pose, lifestyle editorial style, true-to-life color, high fabric detail, 3:4.',
    ),
    ecomImage(
      'selling1',
      3,
      0,
      '卖点图1 · 面料科技',
      'E-commerce selling-point poster, close-up hero shot of the garment fabric highlighting breathable / quick-dry technology, clean studio background, dramatic product lighting, space reserved for callout text, ultra sharp, commercial quality, 3:4.',
    ),
    ecomImage(
      'selling2',
      3,
      1,
      '卖点图2 · 版型剪裁',
      'E-commerce selling-point poster emphasizing the tailored fit and silhouette of the garment on a model, three-quarter view, clean gradient studio background, premium product lighting, room for marketing copy, commercial quality, 3:4.',
    ),
    ecomImage(
      'selling3',
      3,
      2,
      '卖点图3 · 细节工艺',
      'E-commerce selling-point poster, macro detail of stitching, buttons and craftsmanship of the garment, clean minimal background, crisp product lighting, space for callout labels, ultra sharp commercial quality, 3:4.',
    ),
    ecomImage(
      'detail',
      4,
      0,
      '细节展示图',
      'Detailed product display of the garment, multiple close-up crops (collar, cuff, hem) arranged cleanly on seamless white background, even studio lighting, accurate color, ultra-sharp commercial product photography, 3:4.',
    ),
    ecomImage(
      'fabric',
      4,
      1,
      '面料细节图',
      'Extreme macro of the garment fabric weave and texture, showing material quality, soft raking light to reveal surface detail, seamless background, true-to-life color, commercial product photography, 3:4.',
    ),
    ecomImage(
      'size',
      4,
      2,
      '尺码图（含尺码表）',
      'Clean size-guide layout for the garment: flat-lay of the garment on white background with clear measurement reference, minimal infographic style, room for a size table, crisp lighting, commercial quality, 3:4.',
    ),
    ecomImage(
      'aplus_hero',
      5,
      0,
      'A+ 品牌头图',
      'Amazon A+ brand header banner featuring the garment on a model, premium brand aesthetic, wide cinematic composition, clean background with brand-friendly negative space, high-end commercial fashion photography, 16:9.',
    ),
    ecomImage(
      'aplus_core',
      5,
      1,
      'A+ 核心卖点',
      'Amazon A+ core selling-point module, model wearing the garment with confident pose, clean studio background, strong product lighting, generous space for feature callouts, premium commercial photography, 3:4.',
    ),
    ecomImage(
      'aplus_life',
      5,
      2,
      'A+ 生活方式',
      'Amazon A+ lifestyle module, model wearing the garment in an aspirational everyday scene, natural light, authentic lifestyle mood, editorial commercial photography, 16:9.',
    ),
    ecomImage(
      'aplus_multi',
      5,
      3,
      'A+ 多场景',
      'Amazon A+ multi-scene grid concept: the same garment shown across several settings and colorways, consistent model and styling, clean commercial look, high detail, 16:9.',
    ),
    ecomImage(
      'aplus_material',
      5,
      4,
      'A+ 材质',
      'Amazon A+ material module, macro fabric texture paired with the finished garment, premium studio lighting, clean background, space for material-story copy, ultra-sharp commercial photography, 3:4.',
    ),
  ],
  edges: [
    { from: 'product', to: 'scene_analysis' },
    { from: 'scene_analysis', to: 'scene1' },
    { from: 'scene_analysis', to: 'scene2' },
    { from: 'scene_analysis', to: 'scene3' },
    { from: 'scene1', to: 'selling1' },
    { from: 'scene2', to: 'selling2' },
    { from: 'scene3', to: 'selling3' },
    { from: 'product', to: 'detail' },
    { from: 'product', to: 'fabric' },
    { from: 'product', to: 'size' },
    { from: 'selling1', to: 'aplus_hero' },
    { from: 'selling2', to: 'aplus_core' },
    { from: 'scene1', to: 'aplus_life' },
    { from: 'scene2', to: 'aplus_multi' },
    { from: 'fabric', to: 'aplus_material' },
  ],
}

export const WORKFLOW_PRESETS: WorkflowPreset[] = [SHORT_DRAMA, ECOMMERCE]
