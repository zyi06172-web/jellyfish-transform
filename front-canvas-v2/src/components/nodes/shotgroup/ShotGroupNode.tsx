import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { NodeChrome, useIsCompactZoom } from '../NodeChrome'
import { nodeWidthOf } from '../../../pages/Canvas/hooks/useNodeOperations'
import type { StoryboardPage } from '../../../services/workflowArtifacts'
import '../genericNodes.css'

interface ShotGroupData {
  page?: StoryboardPage
}

/** N6 镜头分组节点（业务附件 §6 N6）：只做分组展示，不生图。★ 标记 peak（钩子镜头）。
 *  硬约束提示：1 个镜头（一镜到底）或 ≥4 个镜头（切碎）时黄色警示。 */
function ShotGroupNodeInner({ id, data, selected }: NodeProps) {
  const d = data as unknown as ShotGroupData
  const compact = useIsCompactZoom()
  const shots = d.page?.shots ?? []
  const warn = shots.length === 1 || shots.length >= 4

  return (
    <NodeChrome
      id={id}
      typeLabel="镜头分组"
      title={`镜头分组 · ${d.page?.duration_seconds ?? 5}秒 → ${shots.length}镜头`}
      width={nodeWidthOf('shot_group')}
      status={shots.length ? 'ready' : 'loading'}
      selected={selected}
      compact={compact}
      data={d}
    >
      {warn && <div className="nw-shotgroup-warn">⚠ 分组数量异常（{shots.length} 个），建议让 agent 重分</div>}
      <div className="nw-shotgroup-list">
        {shots.map((s) => (
          <div key={s.shot_group} className="nw-shotgroup-row">
            <span className="nw-shotgroup-name">
              镜头{s.shot_group} {s.is_peak ? '★' : ''}
            </span>
            <span>
              格{s.first_cell}-{s.last_cell}
            </span>
            <span>{s.duration_seconds ?? '-'}s</span>
            <span>
              {s.camera_shot ?? ''} · {s.movement ?? ''}
            </span>
            {s.screen_direction && <span className="nw-shotgroup-axis">守轴线：{s.screen_direction}</span>}
          </div>
        ))}
      </div>
    </NodeChrome>
  )
}

export const ShotGroupNode = memo(ShotGroupNodeInner)
