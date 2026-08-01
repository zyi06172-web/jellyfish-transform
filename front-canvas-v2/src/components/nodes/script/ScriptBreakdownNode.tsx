import { memo, useMemo, useState } from 'react'
import type { NodeProps, Edge } from '@xyflow/react'
import { ArrowUpOutlined, FileTextOutlined } from '@ant-design/icons'
import { message } from 'antd'
import { NodeChrome, useIsCompactZoom } from '../NodeChrome'
import { useCanvasFlow } from '../../../pages/Canvas/CanvasFlowContext'
import { nodeWidthOf, useNodeOperations } from '../../../pages/Canvas/hooks/useNodeOperations'
import { analyzeScriptLocally, extractEntitiesFromRows, rowsFromScript } from '../../../services/promptIntelligence'
import type { BaseNodeData, ShotScriptRow } from '../../../types/canvas'
import '../genericNodes.css'
import './scriptBreakdownNode.css'

interface ScriptBreakdownData extends BaseNodeData {
  script_text?: string
  rows?: ShotScriptRow[]
  auto_entities_created?: boolean
}

/** 分镜脚本生成节点：输入剧本后产出表格式分镜，并自动提取 @实体建资产节点和连线。 */
function ScriptBreakdownNodeInner({ id, data, selected }: NodeProps) {
  const d = data as unknown as ScriptBreakdownData
  const compact = useIsCompactZoom()
  const { setNodes, setEdges } = useCanvasFlow()
  const { patchNodeData } = useNodeOperations()
  const [draft, setDraft] = useState(d.script_text ?? '')
  const rows = useMemo(() => d.rows ?? [], [d.rows])
  const entities = useMemo(() => extractEntitiesFromRows(rows), [rows])

  const buildRows = () => {
    if (!draft.trim()) {
      message.warning('请输入剧本')
      return
    }
    const nextRows = rowsFromScript(draft)
    patchNodeData(id, {
      status: 'ready',
      script_text: draft,
      rows: nextRows,
      analysis: analyzeScriptLocally(draft),
      auto_entities_created: false,
    })
  }

  const createEntities = () => {
    const nextEntities = extractEntitiesFromRows(rows)
    if (!nextEntities.length) {
      message.warning('没有识别到 @实体 标记')
      return
    }
    setNodes((prev) => {
      const existing = new Set(prev.map((node) => node.id))
      const source = prev.find((node) => node.id === id)
      const baseX = (source?.position.x ?? 640) - 500
      const baseY = source?.position.y ?? 120
      const additions = nextEntities
        .filter((entity) => !existing.has(entity.id))
        .map((entity, index) => ({
          id: entity.id,
          type: entity.kind,
          position: { x: baseX, y: baseY + index * 250 },
          data: {
            kind: entity.kind,
            title: `${entity.kind === 'character' ? '角色资产' : entity.kind === 'location' ? '场景资产' : '道具资产'} · ${entity.name}`,
            name: entity.name,
            status: 'empty',
            created_at: new Date().toISOString(),
            extracted_description: entity.description,
            extracted_entity_type: entity.kind,
            source_context_node_id: id,
            analysis: d.analysis ?? analyzeScriptLocally(d.script_text ?? ''),
            dialog: { prompt: entity.description },
          },
        }))
      return additions.length ? [...prev, ...additions] : prev
    })
    setEdges((prev) => {
      const existing = new Set(prev.map((edge) => edge.id))
      const additions: Edge[] = nextEntities
        .map((entity) => ({ id: `edge_${entity.id}_${id}`, source: entity.id, target: id, type: 'rainbow' }))
        .filter((edge) => !existing.has(edge.id))
      return additions.length ? [...prev, ...additions] : prev
    })
    patchNodeData(id, { auto_entities_created: true })
    message.success(`已提取 ${nextEntities.length} 个实体并自动连线`)
  }

  return (
    <NodeChrome
      id={id}
      typeLabel="分镜脚本"
      title={d.title || '分镜脚本生成'}
      width={nodeWidthOf('script_breakdown')}
      status={rows.length ? 'ready' : d.status}
      selected={selected}
      compact={compact}
      data={d}
      toolbar={rows.length ? [{ key: 'extract', icon: <ArrowUpOutlined />, tooltip: '提取 @实体 并建节点', onClick: createEntities }] : []}
    >
      {!rows.length ? (
        <div className="nw-breakdown-input">
          <div className="nw-breakdown-role">分镜脚本</div>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="输入剧本自动生成分镜脚本"
          />
          <button className="nw-btn" onClick={buildRows}>
            <FileTextOutlined /> 生成分镜脚本
          </button>
        </div>
      ) : (
        <>
          <table className="nw-breakdown-table">
            <thead>
              <tr>
                <th>序号</th>
                <th>时长</th>
                <th>画面描述</th>
                <th>台词/旁白</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.index}</td>
                  <td>{row.duration}</td>
                  <td>{row.visual}</td>
                  <td>{row.dialogue || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="nw-breakdown-footer">
            <span>识别到 {entities.length} 个 @实体</span>
            <button className="nw-btn nw-btn-secondary" onClick={createEntities}>
              <ArrowUpOutlined /> 自动提取并连线
            </button>
          </div>
        </>
      )}
    </NodeChrome>
  )
}

export const ScriptBreakdownNode = memo(ScriptBreakdownNodeInner)
