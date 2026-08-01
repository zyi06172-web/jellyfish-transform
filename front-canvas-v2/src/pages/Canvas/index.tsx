import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ReactFlowProvider, useNodesState, useEdgesState, type Node, type Edge } from '@xyflow/react'
import { Spin } from 'antd'
import { CanvasBoard } from './CanvasBoard'
import { CanvasFlowContext } from './CanvasFlowContext'
import { LeftRail } from './LeftRail'
import { AssetLibraryPanel } from './AssetLibraryPanel'
import { PresetWorkflowPanel } from './PresetWorkflowPanel'
import { HistoryPanel } from './HistoryPanel'
import { RechargePage } from './RechargePage'
import { AgentPanel } from '../../components/agent/AgentPanel'
import { useWorkflowSync } from './hooks/useWorkflowSync'
import { ProjectContext } from '../../state/projectContext'
import { StudioProjectsService } from '../../services/generated'
import type { ProjectRead } from '../../services/generated'
import '@xyflow/react/dist/style.css'
import './canvas.css'

/** 画布页外壳（第二轮修改单）：无顶栏、永久暗色。
 *  左侧竖栏（§1.3）+ 无限画布 + 弹出面板（资产库/预设工作流/历史/充值）+ 女娲 Agent。 */
export default function CanvasPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [project, setProject] = useState<ProjectRead | null>(null)
  const [loading, setLoading] = useState(true)
  const [nodes, setNodes] = useNodesState<Node>([])
  const [edges, setEdges] = useEdgesState<Edge>([])

  useEffect(() => {
    if (!projectId) return
    let alive = true
    StudioProjectsService.getProjectApiV1StudioProjectsProjectIdGet({ projectId })
      .then((res) => {
        if (!alive) return
        setProject(res.data ?? null)
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [projectId])

  if (!projectId) return null
  if (loading) {
    return (
      <div className="nw-canvas-loading">
        <Spin size="large" />
      </div>
    )
  }

  return (
    <ProjectContext.Provider value={project}>
      <ReactFlowProvider>
        <CanvasFlowContext.Provider value={{ nodes, edges, setNodes, setEdges }}>
          <div className="nw-canvas-page">
            <div className="nw-canvas-stage">
              <CanvasBoard projectId={projectId} />
            </div>
            <LeftRail />
            <AssetLibraryPanel projectId={projectId} />
            <PresetWorkflowPanel />
            <HistoryPanel />
            <RechargePage />
            <AgentDriver projectId={projectId} />
          </div>
        </CanvasFlowContext.Provider>
      </ReactFlowProvider>
    </ProjectContext.Provider>
  )
}

/** 女娲 Agent：右侧引导面板，由左栏底部彩虹小球开合；驱动短剧 workflow 同步。 */
function AgentDriver({ projectId }: { projectId: string }) {
  const { syncFromWorkspace } = useWorkflowSync(projectId)
  return <AgentPanel projectId={projectId} onWorkspaceUpdated={(snap, raw) => void syncFromWorkspace(snap, raw)} />
}
