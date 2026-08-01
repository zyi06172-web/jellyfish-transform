/**
 * 从 agent workspace 快照的 `artifacts`（Record<string, any>）里挑出手绘故事板产物。
 * 形状来自后端 hand_drawn_storyboard.py（研究确认，未在前端捏造字段名）：
 *   artifact.content_json.pages[]: { chapter_id, aspect_ratio, panel_count, duration_seconds,
 *     blank_panel_index, image_url, panels[], shots[], panel_to_shot }
 * 每个 artifact 可能累计多页（按 chapter_id 区分），这里默认取最新一页。
 */
export interface SixElementField {
  value: string
  motion_process?: string
}

export interface SixElements {
  subject?: SixElementField
  scene?: SixElementField
  camera?: SixElementField
  shot_size?: SixElementField
  shooting_method?: SixElementField
  lighting?: SixElementField
}

export interface StoryboardPanel {
  shot_id: string
  shot_index: number
  shot_title?: string
  second: number
  is_blank: boolean
  visible_summary?: string
  six_elements_for_video_model?: SixElements
  shot_group?: number
  screen_direction_guidance?: string
  composition_anchor?: string
  emotion?: string
}

export interface StoryboardShotGroup {
  shot_group: number
  first_cell: number
  last_cell: number
  duration_seconds?: number
  camera_shot?: string
  angle?: string
  movement?: string
  subject?: string
  screen_direction?: string
  composition_anchor?: string
  action_beats?: string[]
  reference_mode?: string
  motion_description?: string
  is_peak?: boolean
}

export interface StoryboardPage {
  chapter_id: string
  aspect_ratio?: string
  panel_count?: number
  duration_seconds?: number
  blank_panel_index?: number
  image_file_id?: string
  image_url?: string
  task_id?: string
  panels: StoryboardPanel[]
  shots: StoryboardShotGroup[]
  panel_to_shot?: Record<string, number>
}

function looksLikeStoryboardPage(page: unknown): page is StoryboardPage {
  if (!page || typeof page !== 'object') return false
  const p = page as Record<string, unknown>
  return Array.isArray(p.panels)
}

/** 扫描 workspace.artifacts，找到含 pages[].panels[] 的手绘故事板产物；取最新一页（数组末项）。 */
export function findStoryboardPage(artifacts: Record<string, unknown> | undefined): StoryboardPage | null {
  if (!artifacts) return null
  for (const value of Object.values(artifacts)) {
    const contentJson = (value as { content_json?: unknown })?.content_json ?? value
    const pages = (contentJson as { pages?: unknown[] })?.pages
    if (Array.isArray(pages)) {
      const match = [...pages].reverse().find(looksLikeStoryboardPage)
      if (match) return match as StoryboardPage
    }
  }
  return null
}

/**
 * "镜头运动设计 6 项"（业务附件 §9）在后端没有对应字段（研究已确认：
 * 跟随对象/运动路线/空间关系/主体关系变化/停顿点/结尾信息变化 全仓库无匹配字段）。
 * 这里从已有的 shot_group 字段做近似推导，仅用于文字分镜表预审展示，
 * 明确标注"近似"，不冒充后端已落库的结构化字段。
 */
export interface CameraDesignSteps {
  followTarget: string
  motionPath: string
  spaceExplain: string
  relationChange: string
  pausePoint: string
  endingChange: string
  approximate: true
}

export function deriveCameraDesignSteps(group: StoryboardShotGroup): CameraDesignSteps {
  const beats = group.action_beats ?? []
  return {
    followTarget: group.subject || '（未提供，近似留空）',
    motionPath: group.motion_description || '（未提供，近似留空）',
    spaceExplain: [group.angle, group.camera_shot].filter(Boolean).join(' · ') || '（未提供，近似留空）',
    relationChange: group.composition_anchor || '（未提供，近似留空）',
    pausePoint: group.is_peak ? '峰值镜头：动作到位后短暂停顿，强化冲击（近似推断）' : '未标记明显停顿点（近似推断）',
    endingChange: beats[beats.length - 1] || group.motion_description || '（未提供，近似留空）',
    approximate: true,
  }
}

export function contentPanels(page: StoryboardPage | null): StoryboardPanel[] {
  if (!page) return []
  return page.panels.filter((p) => !p.is_blank)
}

export function blankPanel(page: StoryboardPage | null): StoryboardPanel | undefined {
  return page?.panels.find((p) => p.is_blank)
}
