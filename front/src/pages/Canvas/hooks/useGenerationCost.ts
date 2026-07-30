import type { CanvasNodeType } from '../types'

const MODEL_BY_TYPE: Partial<Record<CanvasNodeType, string>> = {
  character: 'Seedream',
  location: 'Seedream',
  prop: 'Seedream',
  storyboard: 'Seedream',
  keyframe: 'Seedream',
  video: 'Seedance 2.0',
}

/** useGenerationCost 提供成本闸门文案的前端预估，真实 usage 以后端落库为准。 */
export function useGenerationCost() {
  const estimate = (type: CanvasNodeType, count = 1) => {
    if (type === 'video') return { model: MODEL_BY_TYPE[type] || 'Seedance 2.0', cny: count * 7.99 }
    if (type === 'keyframe') return { model: MODEL_BY_TYPE[type] || 'Seedream', cny: count * 0.11 }
    if (type === 'storyboard') return { model: MODEL_BY_TYPE[type] || 'Seedream', cny: 0.3 }
    if (type === 'character') return { model: MODEL_BY_TYPE[type] || 'Seedream', cny: 0.33 }
    return { model: MODEL_BY_TYPE[type] || 'DeepSeek', cny: 0 }
  }

  return { estimate }
}
