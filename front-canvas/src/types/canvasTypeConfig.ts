import type { CanvasType } from './canvas'
import { AIGC_IMAGE_PRESETS, ECOMMERCE_IMAGE_PRESETS } from './canvas'
import { DRAMA_WORKFLOW_STAGES, ECOMMERCE_WORKFLOW_STAGES } from './recipes'

export type AgentForm = 'ball' | 'panel'

/** 同一套画布 + 一份"画布类型配置"，三种画布只是装的内容不同（计划书 §10.2） */
export interface CanvasTypeConfig {
  type: CanvasType
  label: string
  agentForm: AgentForm
  hasWorkflow: boolean
  workflowStages: ReadonlyArray<{ key: string; label: string }>
  imagePresets: ReadonlyArray<{ key: string; label: string }>
  connectionRulesEnforced: boolean
  /** 允许的连线：仅在 connectionRulesEnforced=true 时生效（软提示，不硬禁） */
  allowedConnections: ReadonlyArray<readonly [string, string]>
}

const DRAMA_CONNECTIONS: ReadonlyArray<readonly [string, string]> = [
  ['script', 'character'],
  ['script', 'location'],
  ['script', 'prop'],
  ['script', 'storyboard'],
  ['character', 'storyboard'],
  ['character', 'keyframe'],
  ['location', 'storyboard'],
  ['location', 'keyframe'],
  ['prop', 'storyboard'],
  ['storyboard', 'shot_group'],
  ['storyboard', 'shotlist_text'],
  ['shot_group', 'keyframe'],
  ['keyframe', 'shotlist_render'],
  ['shotlist_render', 'video_shot'],
  ['shotlist_text', 'keyframe'],
]

export const CANVAS_TYPE_CONFIGS: Record<CanvasType, CanvasTypeConfig> = {
  aigc: {
    type: 'aigc',
    label: '专业 AIGC 画布',
    agentForm: 'panel',
    hasWorkflow: true,
    workflowStages: DRAMA_WORKFLOW_STAGES,
    imagePresets: AIGC_IMAGE_PRESETS,
    connectionRulesEnforced: true,
    allowedConnections: DRAMA_CONNECTIONS,
  },
  ecommerce: {
    type: 'ecommerce',
    label: '专业电商画布',
    agentForm: 'panel',
    hasWorkflow: true,
    workflowStages: ECOMMERCE_WORKFLOW_STAGES,
    imagePresets: ECOMMERCE_IMAGE_PRESETS,
    connectionRulesEnforced: true,
    allowedConnections: [
      ['product', 'image'],
      ['image', 'image'],
      ['text', 'image'],
    ],
  },
  custom: {
    type: 'custom',
    label: '自定义画布',
    agentForm: 'ball',
    hasWorkflow: false,
    workflowStages: [],
    imagePresets: AIGC_IMAGE_PRESETS,
    connectionRulesEnforced: false,
    allowedConnections: [],
  },
}
