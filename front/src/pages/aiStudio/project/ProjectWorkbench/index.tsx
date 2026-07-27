import React from 'react'
import { Button, Empty, Spin } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { Link, useParams } from 'react-router-dom'
import { useProject } from './hooks/useProjectData'
import { useWorkspaceSnapshot } from './useWorkspaceSnapshot'
import { LeftNav } from './nav/LeftNav'
import { StoryboardPanel } from './board/StoryboardPanel'
import { PreviewPane } from './preview/PreviewPane'
import { AgentChat } from './agent/AgentChat'

const ProjectWorkbench: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const { project, loading: projectLoading } = useProject(projectId)
  const { snapshot, loading, submitting, error, refresh, submitTurn } = useWorkspaceSnapshot(projectId)

  if (!project && !projectLoading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-black text-white">
        <div className="text-center">
          <Empty description={<span className="text-black/50">项目不存在</span>} />
          <Link to="/projects">
            <Button icon={<ArrowLeftOutlined />}>返回主页</Button>
          </Link>
        </div>
      </div>
    )
  }

  if (projectLoading && !project) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-black">
        <Spin />
      </div>
    )
  }

  return (
    <div className="grid h-[100dvh] min-h-0 grid-cols-[10%_27%_27%_36%] overflow-hidden bg-black text-white">
      <LeftNav />
      <StoryboardPanel snapshot={snapshot} />
      <PreviewPane project={project} snapshot={snapshot} />
      <AgentChat
        messages={snapshot?.messages ?? []}
        questionCard={snapshot?.question_card}
        revision={snapshot?.revision ?? 0}
        loading={loading}
        submitting={submitting}
        error={error}
        onRefresh={() => void refresh()}
        onChoice={(choiceId) => {
          void submitTurn({ type: 'choice', choice_id: choiceId })
        }}
        onText={(text) => {
          void submitTurn({ type: 'text', text })
        }}
      />
    </div>
  )
}

export default ProjectWorkbench
