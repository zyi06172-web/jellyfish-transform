import { useEffect, useState } from 'react'
import { Empty, Spin } from 'antd'
import { ReactFlowProvider } from '@xyflow/react'
import { useParams, useSearchParams } from 'react-router-dom'
import {
  StudioChaptersService,
  StudioProjectsService,
  type ChapterRead,
  type ProjectAssetLibraryRead,
  type ProjectRead,
} from '../../services/generated'
import { useWorkspaceSnapshot } from '../aiStudio/project/ProjectWorkbench/useWorkspaceSnapshot'
import { CanvasBoard } from './CanvasBoard'

/** CanvasPage 是第6批新画布页外壳；旧项目路由会指向这里。 */
export default function CanvasPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [searchParams] = useSearchParams()
  const chapterId = searchParams.get('chapterId')
  const [project, setProject] = useState<ProjectRead | null>(null)
  const [chapter, setChapter] = useState<ChapterRead | null>(null)
  const [library, setLibrary] = useState<ProjectAssetLibraryRead | null>(null)
  const [loading, setLoading] = useState(true)
  const { snapshot, loading: agentLoading, submitting, error, refresh, submitTurn } = useWorkspaceSnapshot(projectId)

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const [projectRes, libraryRes] = await Promise.all([
          StudioProjectsService.getProjectApiV1StudioProjectsProjectIdGet({ projectId }),
          StudioProjectsService.getProjectAssetLibraryApiV1StudioProjectsProjectIdAssetLibraryGet({ projectId }),
        ])
        if (!cancelled) {
          setProject(projectRes.data ?? null)
          setLibrary(libraryRes.data ?? null)
        }
        if (chapterId) {
          const chapterRes = await StudioChaptersService.getChapterApiV1StudioChaptersChapterIdGet({ chapterId })
          if (!cancelled) setChapter(chapterRes.data ?? null)
        }
      } catch {
        if (!cancelled) {
          setProject(null)
          setLibrary(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [chapterId, projectId, snapshot?.revision])

  if (!projectId) return <div className="flex h-[100dvh] items-center justify-center bg-black text-white">缺少项目 ID</div>
  if (loading) return <div className="flex h-[100dvh] items-center justify-center bg-black"><Spin /></div>
  if (!project) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-black text-white">
        <Empty description={<span className="text-white/50">项目不存在</span>} />
      </div>
    )
  }

  return (
    <div className="h-[100dvh] min-h-0 bg-black text-white">
      {chapterId ? (
        <div className="pointer-events-none absolute left-6 top-6 z-20 rounded-full border border-white/12 bg-black px-4 py-2 text-xs text-white/72">
          当前画布：{chapter?.title || chapterId}
        </div>
      ) : null}
      {agentLoading || submitting ? (
        <div className="pointer-events-none absolute left-1/2 top-6 z-20 -translate-x-1/2 rounded-full border border-white/12 bg-black px-4 py-2 text-xs text-white/72">
          {submitting ? 'Agent 正在提交…' : '正在刷新工作台…'}
        </div>
      ) : null}
      <ReactFlowProvider>
        <CanvasBoard
          project={project}
          projectId={projectId}
          chapterId={chapterId}
          snapshot={snapshot}
          library={library}
          agentLoading={agentLoading}
          agentSubmitting={submitting}
          agentError={error}
          onRefresh={() => void refresh()}
          onChoice={(choiceId) => {
            void submitTurn({ type: 'choice', choice_id: choiceId })
          }}
          onText={(text) => {
            void submitTurn({ type: 'text', text })
          }}
        />
      </ReactFlowProvider>
    </div>
  )
}
