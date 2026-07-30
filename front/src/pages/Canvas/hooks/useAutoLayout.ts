import type { CanvasNodeType } from '../types'

const COLUMN_X: Record<CanvasNodeType, number> = {
  script: 0,
  character: 520,
  location: 520,
  prop: 520,
  storyboard: 1040,
  shot_group: 1900,
  shotlist_text: 1900,
  keyframe: 2680,
  shotlist_render: 3420,
  video: 4520,
}

/** useAutoLayout 负责 Agent 自动落节点时的列式落位与派生偏移。 */
export function useAutoLayout() {
  const positionFor = (type: CanvasNodeType, index: number) => ({
    x: COLUMN_X[type],
    y: 80 + index * 300,
  })

  const derivedPosition = (source?: { x: number; y: number }) => ({
    x: (source?.x ?? 0) + 60,
    y: (source?.y ?? 0) + 40,
  })

  return { positionFor, derivedPosition }
}
