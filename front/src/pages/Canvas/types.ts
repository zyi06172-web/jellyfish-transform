import type { ReactNode } from 'react'

export type CanvasNodeType =
  | 'script'
  | 'character'
  | 'location'
  | 'prop'
  | 'storyboard'
  | 'shot_group'
  | 'keyframe'
  | 'shotlist_text'
  | 'shotlist_render'
  | 'video'

export type CanvasNodeStatus = 'empty' | 'loading' | 'ready' | 'error'

export type CanvasCost = {
  model: string
  tokens?: number
  cny?: number
}

export type ToolbarItem = {
  key: string
  icon: ReactNode
  tooltip: string
  danger?: boolean
  onClick: () => void
}

export type BaseCanvasNodeData = {
  project_id: string
  canvas_id: string
  status: CanvasNodeStatus
  error?: string
  created_at: string
  seed?: number
  derived_from?: string
  cost?: CanvasCost
  pinned?: boolean
  title?: string
  subtitle?: string
  __ops?: {
    copy: (nodeId: string) => void
    focus: (nodeId: string) => void
    delete: (nodeId: string) => void
    derive: (nodeId: string, patch?: Partial<NuwaCanvasNodeData>) => void
  }
}

export type ScriptNodeData = BaseCanvasNodeData & {
  raw_script: string
  parsed?: {
    story_structure?: unknown
    characters?: string[]
    shots_info?: unknown
  }
}

export type CharacterNodeData = BaseCanvasNodeData & {
  character_id?: string
  name: string
  bible_json?: Record<string, unknown>
  reference_layout?: 'four_view'
  images?: {
    face_closeup?: string
    full_front?: string
    full_side?: string
    full_back?: string
  }
  linked_existing?: boolean
}

export type LocationNodeData = BaseCanvasNodeData & {
  location_id?: string
  name: string
  time_of_day?: string
  mood?: string
  style?: string
  images?: string[]
}

export type PropNodeData = BaseCanvasNodeData & {
  prop_id?: string
  name: string
  is_wearable?: boolean
  image?: string
  character_node_id?: string
}

export type StoryboardPanel = {
  index: number
  one_sentence_summary: string
  six_elements_for_video_model?: Record<string, unknown>
  is_blank?: boolean
}

export type StoryboardNodeData = BaseCanvasNodeData & {
  content_json?: {
    pages?: Array<{
      image_url?: string
      image_file_id?: string
      panels?: StoryboardPanel[]
    }>
  }
}

export type ShotGroupNodeData = BaseCanvasNodeData & {
  shots?: Array<{
    shot_index: number
    first_frame: number
    last_frame: number
    duration: number
    camera_shot: string
    movement: string
    composition_anchor?: string
    screen_direction_guidance?: string
    action_beats?: string[]
    is_peak?: boolean
  }>
}

export type KeyframeNodeData = BaseCanvasNodeData & {
  frames?: Array<{
    panel_index: number
    url?: string
    seed?: number
    status: CanvasNodeStatus
    task_id?: string
  }>
}

export type ShotlistTextRow = {
  panel_index: number
  one_sentence_summary: string
  six_elements_for_video_model?: Record<string, unknown>
  emotion?: string
  action_beats?: string[]
  motion_design?: {
    follow_subject?: string
    route?: string
    spatial_explanation?: string
    relationship_change?: string
    pause_point?: string
    ending_information?: string
  }
}

export type ShotlistTextNodeData = BaseCanvasNodeData & {
  rows?: ShotlistTextRow[]
}

export type ShotlistRenderNodeData = BaseCanvasNodeData & {
  keyframe_node_id?: string
  shot_group_node_id?: string
  rows?: Array<{
    panel_index: number
    frame_url?: string
    movement?: string
    camera_shot?: string
    emotion?: string
    action_beats?: string[]
    atmosphere?: string
  }>
}

export type VideoNodeData = BaseCanvasNodeData & {
  clip_id?: string
  url?: string
  duration?: number
  resolution?: string
  aspect_ratio?: string
  shot_index?: number
  prompt_used?: string
}

export type NuwaCanvasNodeData =
  | ScriptNodeData
  | CharacterNodeData
  | LocationNodeData
  | PropNodeData
  | StoryboardNodeData
  | ShotGroupNodeData
  | KeyframeNodeData
  | ShotlistTextNodeData
  | ShotlistRenderNodeData
  | VideoNodeData

export const NODE_WIDTH: Record<CanvasNodeType, number> = {
  script: 420,
  character: 460,
  location: 380,
  prop: 320,
  storyboard: 780,
  shot_group: 620,
  keyframe: 640,
  shotlist_text: 720,
  shotlist_render: 980,
  video: 440,
}

export const DEFAULT_CANVAS_RATIO = '16:9'
