import { useCallback } from 'react'
import { Tabs, Empty, message } from 'antd'
import { useReactFlow, type Node, type Edge } from '@xyflow/react'
import { CloseOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { useUiStore } from '../../state/uiStore'
import { useCanvasFlow } from './CanvasFlowContext'
import { nodeWidthOf } from './hooks/useNodeOperations'
import { WORKFLOW_PRESETS, type WorkflowPreset } from '../../types/workflowPresets'
import './presetPanel.css'

const COL_W = 500
const ROW_H = 440

/** §4 预设工作流面板：点一张卡片 → 把整套预置节点 + 连线一次性铺到画布上。
 *  §1.2 里被删掉的"画布类型选择器"功能并入这里（不再有画布类型，靠预设决定装什么内容）。 */
export function PresetWorkflowPanel() {
  const open = useUiStore((s) => s.activePanel) === 'presets'
  const setActivePanel = useUiStore((s) => s.setActivePanel)
  const { setNodes, setEdges } = useCanvasFlow()
  const { setCenter } = useReactFlow()

  const applyPreset = useCallback(
    (preset: WorkflowPreset) => {
      const stamp = Date.now().toString(36)
      const idMap = new Map<string, string>()
      // 铺开起点：画布上方留白处，避免和已有节点重叠
      const originX = 120
      const originY = 120

      const newNodes: Node[] = preset.nodes.map((p) => {
        const realId = `${preset.id}_${p.localId}_${stamp}`
        idMap.set(p.localId, realId)
        const width = nodeWidthOf(p.kind)
        return {
          id: realId,
          type: p.kind,
          position: { x: originX + p.col * COL_W, y: originY + p.row * ROW_H },
          data: {
            kind: p.kind,
            status: 'empty',
            created_at: new Date().toISOString(),
            dialog: {},
            ...p.data,
          },
          width,
        } as Node
      })

      const newEdges: Edge[] = preset.edges.map((e) => ({
        id: `edge_${idMap.get(e.from)}_${idMap.get(e.to)}`,
        source: idMap.get(e.from)!,
        target: idMap.get(e.to)!,
        type: 'rainbow',
      }))

      setNodes((prev) => [...prev.map((n) => ({ ...n, selected: false })), ...newNodes])
      setEdges((prev) => {
        const existing = new Set(prev.map((e) => e.id))
        return [...prev, ...newEdges.filter((e) => !existing.has(e.id))]
      })
      setActivePanel(null)
      setTimeout(() => setCenter(originX + COL_W, originY + ROW_H, { zoom: 0.5, duration: 600 }), 60)
      message.success(`已铺开「${preset.name}」，共 ${newNodes.length} 个节点`)
    },
    [setNodes, setEdges, setActivePanel, setCenter],
  )

  if (!open) return null

  return (
    <div className="nw-side-panel nw-preset-panel">
      <div className="nw-side-panel-head">
        <span>预设工作流</span>
        <button className="nw-icon-btn" onClick={() => setActivePanel(null)}>
          <CloseOutlined />
        </button>
      </div>
      <Tabs
        items={[
          {
            key: 'community',
            label: '工作流社区',
            children: (
              <div className="nw-preset-list">
                {WORKFLOW_PRESETS.map((p) => (
                  <div key={p.id} className="nw-preset-card" onClick={() => applyPreset(p)}>
                    <div className="nw-preset-card-cover" style={{ background: `linear-gradient(135deg, ${p.accent}, #1c1c1e)` }}>
                      <ThunderboltOutlined />
                    </div>
                    <div className="nw-preset-card-body">
                      <div className="nw-preset-card-title">{p.name}</div>
                      <div className="nw-preset-card-desc">{p.description}</div>
                      <div className="nw-preset-card-meta">{p.nodes.length} 个节点 · 点击一键铺开</div>
                    </div>
                  </div>
                ))}
              </div>
            ),
          },
          {
            key: 'mine',
            label: '我的工作流',
            children: <Empty description="还没有保存的工作流（本轮占位）" style={{ marginTop: 40 }} />,
          },
        ]}
      />
    </div>
  )
}
