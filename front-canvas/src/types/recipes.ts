/** 内置 Recipe：新预设的底层 prompt 模板（计划书 §11.4），落到设置弹窗 Recipes tab 可见/可编辑 */
export interface Recipe {
  id: string
  name: string
  usage: string
  template: string
  editable: true
}

export const BUILTIN_RECIPES: Recipe[] = [
  {
    id: 'drama-character-sheet',
    name: '角色设定图 · drama-character-sheet',
    usage: '为短剧角色生成标准角色设定图（character sheet），供后续所有镜头参照，保证跨镜头一致性。',
    editable: true,
    template: `A professional character design sheet on a pure white studio background, full-body reference of {character_name}.
Character: {appearance_bible}. Wearing: {costume}, with {accessories_with_position}.
Layout: one large front-facing full-body pose on the left, plus supporting details.
Rendering: consistent, neutral studio lighting, no dramatic shadows, sharp focus, high detail on face and costume, photorealistic.
Purpose: this is a reference sheet — keep the character identical to the bible, do NOT invent details not specified.
Aspect ratio {aspect_ratio}. Style: cinematic realism for short-drama production.`,
  },
  {
    id: 'drama-scene-sheet',
    name: '场景设定图 · drama-scene-sheet',
    usage: '为短剧场景生成标准场景设定图，锁定环境、光线、氛围，供该场景所有镜头参照。',
    editable: true,
    template: `A cinematic scene establishing reference of {location_name}, {time_of_day}, mood: {mood}.
Environment: {scene_description}. Architectural and spatial details consistent and clearly readable.
Lighting: {lighting_setup}, cinematic, motivated light sources visible.
Composition: wide establishing framing that shows the full space, empty of characters, so it can serve as a reusable backdrop reference.
Rendering: photorealistic, film-grade color, {aspect_ratio}.
Purpose: environment reference sheet for short-drama shot consistency — keep geography and lighting identical across regenerations.`,
  },
  {
    id: 'ecommerce-product-sheet',
    name: '产品设定图 · ecommerce-product-sheet',
    usage: '电商商品的标准设定图，白底/多角度/细节清晰，供详情页与场景合成使用。',
    editable: true,
    template: `A professional e-commerce product reference of {product_name} on a seamless pure white background (#FFFFFF), studio product photography.
Product: {product_description}. Material and texture: {material_details}.
Lighting: soft even three-point studio lighting, no harsh shadows, accurate color, crisp reflections where appropriate.
Composition: centered hero shot, product fully in frame with breathing room, plus clean detail readability.
Rendering: ultra-sharp, high resolution, commercial product photography quality, {aspect_ratio}.
Purpose: master product reference for detail pages and scene compositing — keep the product identical across regenerations, do NOT alter shape, color, or branding.`,
  },
]

/** 短剧 workflow 引导脚本（计划书 §11.2） */
export const DRAMA_WORKFLOW_STAGES = [
  { key: 'script', label: '贴剧本解析' },
  { key: 'assets', label: '人物/场景/道具资产' },
  { key: 'storyboard', label: '6格手绘故事板' },
  { key: 'shotlist_preview', label: '文字版分镜表预审' },
  { key: 'render', label: '关键帧渲染' },
  { key: 'shotlist_render', label: '渲染版分镜表' },
  { key: 'video', label: 'Seedance 出视频' },
] as const

/** 电商 workflow 草案（计划书 §12.2，产品负责人后续会改） */
export const ECOMMERCE_WORKFLOW_STAGES = [
  { key: 'upload', label: '上传商品原图/描述商品' },
  { key: 'product_sheet', label: '产品设定图（白底）' },
  { key: 'multi_angle', label: '多角度扩展' },
  { key: 'scene_composite', label: '场景合成' },
  { key: 'layout', label: '主图/详情页排版' },
  { key: 'optional', label: '营销海报/尺寸适配（可选）' },
] as const
