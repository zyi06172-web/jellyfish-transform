import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ReactFlowProvider, useNodesState, useEdgesState, type Node, type Edge } from '@xyflow/react'
import { Spin } from 'antd'
import { CanvasBoard } from './CanvasBoard'
import { CanvasFlowContext } from './CanvasFlowContext'
import { TopBar } from './TopBar'
import { PresetBar } from './PresetBar'
import { AssetDrawer } from './AssetDrawer'
import { SettingsModal } from './SettingsModal'
import { AgentPanel } from '../../components/agent/AgentPanel'
import { AgentBall } from '../../components/agent/AgentBall'
import { useWorkflowSync } from './hooks/useWorkflowSync'
import { useUiStore } from '../../state/uiStore'
import { ProjectContext } from '../../state/projectContext'
import { StudioProjectsService } from '../../services/generated'
import type { ProjectRead } from '../../services/generated'
import '@xyflow/react/dist/style.css'
import './canvas.css'

/** 画布页外壳：加载项目 → 提供 CanvasFlowContext（唯一数据源） → 渲染外壳三大件
 *  （顶栏 / 画布 / 资产库+设置弹层）与 agent 双形态。 */
export default function CanvasPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [project, setProject] = useState<ProjectRead | null>(null)
  const [loading, setLoading] = useState(true)
  const [nodes, setNodes] = useNodesState<Node>([])
  const [edges, setEdges] = useEdgesState<Edge>([])
  const canvasType = useUiStore((s) => s.canvasType)
  const setProjectName = useUiStore((s) => s.setProjectName)

  useEffect(() => {
    if (!projectId) return
    let alive = true
    StudioProjectsService.getProjectApiV1StudioProjectsProjectIdGet({ projectId })
      .then((res) => {
        if (!alive) return
        setProject(res.data ?? null)
        if (res.data?.name) setProjectName(res.data.name)
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          <div className={`nw-canvas-page canvas-type-${canvasType}`}>
            <TopBar projectId={projectId} project={project} onProjectUpdated={setProject} />
            {canvasType !== 'custom' && <PresetBar />}
            <div className="nw-canvas-stage">
              <CanvasBoard projectId={projectId} />
            </div>
            <AssetDrawer projectId={projectId} />
            <SettingsModal />
            <AgentDriver projectId={projectId} />
          </div>
        </CanvasFlowContext.Provider>
      </ReactFlowProvider>
    </ProjectContext.Provider>
  )
}

/** 双形态 agent（计划书 §7.3）：自定义画布只用中下小球；AIGC/电商画布默认走右侧
 *  引导面板推进 workflow，同时保留小球供用户自由发挥时随手问（两者共享同一 session）。 */
function AgentDriver({ projectId }: { projectId: string }) {
  const canvasType = useUiStore((s) => s.canvasType)
  const { syncFromWorkspace } = useWorkflowSync(projectId)

  if (canvasType === 'custom') {
    return <AgentBall projectId={projectId} />
  }
  return (
    <>
      <AgentPanel projectId={projectId} onWorkspaceUpdated={(snap, raw) => void syncFromWorkspace(snap, raw)} />
      <AgentBall projectId={projectId} />
    </>
  )
}
