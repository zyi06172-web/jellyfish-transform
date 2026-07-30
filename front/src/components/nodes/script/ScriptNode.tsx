import { EditOutlined, ReloadOutlined } from '@ant-design/icons'
import type { NodeProps } from '@xyflow/react'
import { memo } from 'react'
import { Button } from 'antd'
import { NODE_WIDTH, type ScriptNodeData } from '../../../pages/Canvas/types'
import { NodeLayout } from '../NodeLayout'
import { NodeEmptyState } from '../NodeStates'

/** ScriptNode 展示原始剧本与严格解析状态，是灵魂链路入口节点。 */
function ScriptNodeBase({ id, data, selected }: NodeProps) {
  const nodeData = data as ScriptNodeData
  const characters = nodeData.parsed?.characters ?? []
  const hasStory = hasContent(nodeData.parsed?.story_structure)
  const hasShots = hasContent(nodeData.parsed?.shots_info)

  return (
    <NodeLayout
      id={id}
      type="script"
      title={nodeData.title || '剧本'}
      subtitle={nodeData.subtitle || '贴剧本后由 script_divider_agent 严格解析'}
      width={NODE_WIDTH.script}
      status={nodeData.status}
      errorMessage={nodeData.error}
      selected={selected}
      cost={nodeData.cost}
      handles={{ target: false, source: true }}
      data={nodeData}
      toolbar={[
        { key: 'edit', icon: <EditOutlined />, tooltip: '编辑剧本', onClick: () => undefined },
        { key: 'reanalyze', icon: <ReloadOutlined />, tooltip: '重解析为新节点', onClick: () => undefined },
      ]}
    >
      {nodeData.raw_script ? (
        <div className="space-y-3">
          <div className="nuwa-node-text-block">{nodeData.raw_script}</div>
          <div className="nuwa-node-section-title">解析结果</div>
          <div className="grid gap-2 text-xs text-white/72">
            <div>故事构成 {hasStory ? '✓ 已提取' : '⚠ 缺失'} {!hasStory ? <Button size="small">在对话框补齐</Button> : null}</div>
            <div>角色 {characters.length ? characters.join(' / ') : '⚠ 缺失'}</div>
            <div>分镜信息 {hasShots ? '✓ 已提取' : '⚠ 缺失'} {!hasShots ? <Button size="small">在对话框补齐</Button> : null}</div>
          </div>
        </div>
      ) : (
        <NodeEmptyState label="在右下角 Agent 对话框贴入剧本后，这里会生成严格忠实的解析结果。" />
      )}
    </NodeLayout>
  )
}

function hasContent(value: unknown) {
  if (Array.isArray(value)) return value.length > 0
  if (value && typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0
  return Boolean(value)
}

export const ScriptNode = memo(ScriptNodeBase)
