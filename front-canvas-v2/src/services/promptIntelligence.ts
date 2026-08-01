import type { Node } from '@xyflow/react'
import type { ScriptSceneAnalysis, ShotScriptRow } from '../types/canvas'

export type ExtractedEntityKind = 'character' | 'location' | 'prop'

export interface ExtractedEntity {
  id: string
  name: string
  kind: ExtractedEntityKind
  description: string
}

const CHARACTER_HINTS = ['人', '女', '男', '孩', '妈妈', '父亲', '邮差', '主角', '老人', '老师', '女孩', '男孩']
const LOCATION_HINTS = ['城', '房', '屋', '厅', '街', '店', '山', '海', '邮局', '学校', '办公室', '公园', '云海']
const PROP_HINTS = ['信', '剑', '伞', '戒指', '胸针', '手机', '包', '钥匙', '花', '门票', '邮件', '信封']

function firstMatch(text: string, fallback: string) {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.split(/[。！？!?；;]/).find((part) => part.trim().length > 4)?.trim() || fallback
}

function inferEntityKind(name: string, context = ''): ExtractedEntityKind {
  const haystack = `${name}${context}`
  if (CHARACTER_HINTS.some((item) => haystack.includes(item))) return 'character'
  if (LOCATION_HINTS.some((item) => haystack.includes(item))) return 'location'
  if (PROP_HINTS.some((item) => haystack.includes(item))) return 'prop'
  return context.includes('来到') || context.includes('空间') ? 'location' : 'prop'
}

/** 本地确定性剧情分析：后端 DeepSeek 专用分析接口缺失时仍提供结构化上下文。 */
export function analyzeScriptLocally(script: string): ScriptSceneAnalysis {
  const summary = firstMatch(script, '一场围绕核心人物目标与阻碍展开的戏')
  const mentions = [...script.matchAll(/@([\u4e00-\u9fa5A-Za-z0-9_-]{2,24})/g)].map((m) => m[1])
  const names = Array.from(new Set(mentions)).slice(0, 5).join('、') || '主要人物'
  return {
    scene_event: summary,
    character_state: `${names}处在需要立刻做选择的状态，动作和表情都应服务于当下冲突。`,
    scene_appearance: `空间根据剧本文本建立，保留可被镜头识别的地标、材质、光源和前中后景层次：${summary}`,
    environment_mood: script.includes('夜') || script.includes('雨') ? '低照度、潮湿、压迫感强，情绪偏悬疑。' : '电影感自然光，氛围清晰但保留戏剧张力。',
    psychological_cue: '画面需要让观众在第一眼看出人物关系、行动目标和隐含风险。',
    character_psychology: '人物心理以克制的姿态、视线方向和身体距离表达，不用画面文字解释。',
  }
}

function kindLabel(kind: ExtractedEntityKind | string) {
  if (kind === 'character') return '角色资产'
  if (kind === 'location') return '场景资产'
  if (kind === 'prop') return '道具资产'
  return '资产'
}

/** 基于上游剧情分析生成动态摄影方案，覆盖构图/景别/焦段/机位/光影/材质等要点。 */
export function buildCinematicPlan(params: {
  kind: ExtractedEntityKind | string
  entityName?: string
  analysis?: ScriptSceneAnalysis
  preset?: string
}) {
  const analysis = params.analysis
  const subject = params.entityName || kindLabel(params.kind)
  const layout =
    params.kind === 'character'
      ? '一张横屏合图：左侧大幅面部/上半身特写，右侧三格全身正面、侧面、背面，纯白或极简浅灰背景。'
      : params.kind === 'location'
        ? '一张横屏合图：左侧主空间全景，右侧三格材质细节、入口动线、关键光源/道具角落。'
        : '一张横屏合图：左侧主图展示完整道具，右侧三格结构细节、材质微距、使用方式/尺度参照。'
  return [
    `对象：${subject}。`,
    layout,
    `剧情事件：${analysis?.scene_event || '依据用户输入建立核心戏剧动作'}。`,
    `人物/状态：${analysis?.character_state || '状态清楚、姿态可读'}。`,
    `空间与材质：${analysis?.scene_appearance || '真实可拍摄空间，材质细节明确'}。`,
    `环境情绪：${analysis?.environment_mood || '电影级自然光，层次分明'}。`,
    `心理暗示：${analysis?.psychological_cue || '用光线和构图暗示关系与冲突'}。`,
    '摄影语言：cinematic composition, 35mm/50mm lens language, clear shot scale, stable camera angle, professional production design, detailed texture, high dynamic range lighting, no text overlay.',
  ].join('\n')
}

/** 用户 prompt 优先：冲突处保留用户描述，自动摄影方案只补用户没写的维度。 */
export function mergeUserPromptWithPlan(userPrompt: string, plan: string) {
  const user = userPrompt.trim()
  if (!user) return plan
  return [
    user,
    '',
    '以下为自动摄影方案，仅补充用户未提及的构图、景别、焦段、机位、光影、材质和美术细节；若与上方用户描述冲突，以上方用户描述为准：',
    plan,
  ].join('\n')
}

export function analysisFromUpstream(nodes: Node[]) {
  for (const node of nodes) {
    const data = node.data as { analysis?: ScriptSceneAnalysis; raw_script?: string; rows?: ShotScriptRow[] }
    if (data.analysis) return data.analysis
    if (data.rows?.length) return analyzeScriptLocally(data.rows.map((row) => `${row.visual} ${row.dialogue}`).join('\n'))
    if (data.raw_script) return analyzeScriptLocally(data.raw_script)
  }
  return undefined
}

export function finalAssetPrompt(params: {
  kind: ExtractedEntityKind | string
  userPrompt: string
  entityName?: string
  analysis?: ScriptSceneAnalysis
  preset?: string
}) {
  const plan = buildCinematicPlan(params)
  return { plan, prompt: mergeUserPromptWithPlan(params.userPrompt, plan) }
}

export function rowsFromScript(script: string): ShotScriptRow[] {
  const sentences = script.split(/\n+|(?<=[。！？!?])\s*/).map((item) => item.trim()).filter(Boolean)
  const source = sentences.length ? sentences : [script.trim() || '输入剧本自动生成分镜脚本']
  return source.slice(0, 8).map((line, index) => {
    const visual = line.includes('@') ? line : `${line}，镜头中保留 @主要人物 与 @核心场景 的清晰关系。`
    const quote = line.match(/[“"]([^”"]+)[”"]/)
    return {
      id: `shot_${index + 1}`,
      index: index + 1,
      duration: index === 0 ? '4s' : '5s',
      visual,
      dialogue: quote ? quote[0] : index === 0 ? '@主要人物低声说：“我们开始吧。”' : '',
    }
  })
}

export function extractEntitiesFromRows(rows: ShotScriptRow[]): ExtractedEntity[] {
  const found = new Map<string, ExtractedEntity>()
  rows.forEach((row) => {
    const text = `${row.visual} ${row.dialogue}`
    for (const match of text.matchAll(/@([\u4e00-\u9fa5A-Za-z0-9_-]{2,24})/g)) {
      const name = match[1]
      if (found.has(name)) continue
      const kind = inferEntityKind(name, text)
      found.set(name, {
        id: `${kind}_${name.replace(/[^\u4e00-\u9fa5A-Za-z0-9_-]/g, '')}`,
        name,
        kind,
        description: firstMatch(text, `${name}在分镜脚本中出现，需要补充可视化设定。`),
      })
    }
  })
  return Array.from(found.values())
}
