import { getBezierPath, type ConnectionLineComponentProps } from '@xyflow/react'

/** §2.2 拉线时的连接线：黑线 + 彩虹流光（和已建成的边一致）。 */
export function RainbowConnectionLine({ fromX, fromY, toX, toY, fromPosition, toPosition }: ConnectionLineComponentProps) {
  const [path] = getBezierPath({ sourceX: fromX, sourceY: fromY, targetX: toX, targetY: toY, sourcePosition: fromPosition, targetPosition: toPosition })
  return (
    <g>
      <path d={path} fill="none" stroke="var(--nw-text-1)" strokeWidth={1.6} opacity={0.55} />
      <path d={path} className="nw-rainbow-flow" fill="none" strokeWidth={2} />
    </g>
  )
}
