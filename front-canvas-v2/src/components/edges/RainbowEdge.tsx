import { memo } from 'react'
import { BaseEdge, EdgeProps, getBezierPath } from '@xyflow/react'

/** 黑线 + 彩虹流光叠加（计划书 §4.2②）。重渲派生的历史连线用虚线（原则2）。 */
function RainbowEdgeInner({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, data }: EdgeProps) {
  const [edgePath] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  const isDerived = (data as { derived?: boolean } | undefined)?.derived

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: 'var(--nw-text-1)',
          strokeWidth: 1.6,
          strokeDasharray: isDerived ? '6 5' : undefined,
          opacity: 0.55,
          ...style,
        }}
      />
      <path d={edgePath} className="nw-rainbow-flow" fill="none" strokeWidth={2} />
    </>
  )
}

export const RainbowEdge = memo(RainbowEdgeInner)

export const edgeTypes = { rainbow: RainbowEdge } as const
