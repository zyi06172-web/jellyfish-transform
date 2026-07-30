import { CheckOutlined, ReloadOutlined } from '@ant-design/icons'
import type { NodeProps } from '@xyflow/react'
import { memo } from 'react'
import { Collapse } from 'antd'
import { NODE_WIDTH, type ShotlistTextNodeData } from '../../../pages/Canvas/types'
import { NodeLayout } from '../NodeLayout'
import { NodeEmptyState } from '../NodeStates'

/** ShotlistTextNode 是免费预审闸门，允许展开六要素和镜头运动设计。 */
function ShotlistTextNodeBase({ id, data, selected }: NodeProps) {
  const nodeData = data as ShotlistTextNodeData
  const rows = nodeData.rows ?? []

  return (
    <NodeLayout
      id={id}
      type="shotlist_text"
      title={nodeData.title || '文字版分镜表'}
      subtitle="免费预审 · 渲染前闸门"
      width={NODE_WIDTH.shotlist_text}
      status={nodeData.status}
      errorMessage={nodeData.error}
      selected={selected}
      handles={{ target: true, source: true }}
      data={nodeData}
      toolbar={[
        { key: 'revise', icon: <ReloadOutlined />, tooltip: '继续补充信息', onClick: () => undefined },
        { key: 'render', icon: <CheckOutlined />, tooltip: '开始渲染', onClick: () => undefined },
      ]}
    >
      {rows.length ? (
        <Collapse
          size="small"
          items={rows.map((row) => ({
            key: String(row.panel_index),
            label: `格 ${row.panel_index} · ${row.one_sentence_summary}`,
            children: (
              <div className="space-y-2 text-xs text-white/70">
                <pre className="nuwa-node-json">{JSON.stringify(row.six_elements_for_video_model ?? {}, null, 2)}</pre>
                <div>情绪：{row.emotion || '待补充'}</div>
                <div>运动逻辑：{(row.action_beats ?? []).join(' → ') || '待补充'}</div>
                <ol className="nuwa-motion-list">
                  <li>确定跟随对象：{row.motion_design?.follow_subject || '待补充'}</li>
                  <li>设计运动路线：{row.motion_design?.route || '待补充'}</li>
                  <li>用镜头运动解释空间：{row.motion_design?.spatial_explanation || '待补充'}</li>
                  <li>安排主体关系变化：{row.motion_design?.relationship_change || '待补充'}</li>
                  <li>设计停顿点：{row.motion_design?.pause_point || '待补充'}</li>
                  <li>明确结尾的信息变化：{row.motion_design?.ending_information || '待补充'}</li>
                </ol>
              </div>
            ),
          }))}
        />
      ) : (
        <NodeEmptyState label="故事板完成后生成文字分镜表，供渲染前免费预审。" />
      )}
    </NodeLayout>
  )
}

export const ShotlistTextNode = memo(ShotlistTextNodeBase)
