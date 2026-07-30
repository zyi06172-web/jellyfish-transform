import { ReloadOutlined } from '@ant-design/icons'
import type { NodeProps } from '@xyflow/react'
import { memo } from 'react'
import { NODE_WIDTH, type ShotGroupNodeData } from '../../../pages/Canvas/types'
import { NodeLayout } from '../NodeLayout'
import { NodeEmptyState } from '../NodeStates'

/** ShotGroupNode 展示故事板格到视频镜头的分组，不发起生图。 */
function ShotGroupNodeBase({ id, data, selected }: NodeProps) {
  const nodeData = data as ShotGroupNodeData
  const shots = nodeData.shots ?? []
  const invalid = shots.length === 1 || shots.length >= 4

  return (
    <NodeLayout
      id={id}
      type="shot_group"
      title={nodeData.title || `镜头分组 · 5秒 → ${shots.length || 0}镜头`}
      subtitle={invalid ? '分组需要复核' : '守轴线 · 控制切分粒度'}
      width={NODE_WIDTH.shot_group}
      status={nodeData.status}
      errorMessage={nodeData.error}
      selected={selected}
      handles={{ target: true, source: true }}
      data={nodeData}
      toolbar={[{ key: 'regroup', icon: <ReloadOutlined />, tooltip: '让 Agent 重分', onClick: () => undefined }]}
    >
      {shots.length ? (
        <div className="space-y-2">
          {invalid ? <div className="nuwa-node-warning">分组过粗或过碎，请让 Agent 重分。</div> : null}
          {shots.map((shot) => (
            <div key={shot.shot_index} className="nuwa-shot-row">
              <b>镜头{shot.shot_index}</b>
              <span>格{shot.first_frame}-{shot.last_frame}</span>
              <span>{shot.duration}s</span>
              <span>{shot.camera_shot} · {shot.movement}</span>
              <span>{shot.screen_direction_guidance}</span>
              {shot.is_peak ? <b>★钩子</b> : null}
            </div>
          ))}
        </div>
      ) : (
        <NodeEmptyState label="故事板确认后生成 2-3 个视频镜头分组。" />
      )}
    </NodeLayout>
  )
}

export const ShotGroupNode = memo(ShotGroupNodeBase)
