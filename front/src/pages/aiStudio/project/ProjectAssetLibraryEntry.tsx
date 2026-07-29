import { useEffect, useState } from 'react'
import type React from 'react'
import { Button, Empty, Spin, message } from 'antd'
import { AppstoreOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { StudioProjectsService, type ProjectRead } from '../../../services/generated'

/** 全局资产库入口：删掉 Jellyfish 老资产库后，跳转到最近项目的女娲版资产库。 */
const ProjectAssetLibraryEntry: React.FC = () => {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [projects, setProjects] = useState<ProjectRead[]>([])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const res = await StudioProjectsService.listProjectsApiV1StudioProjectsGet({ page: 1, pageSize: 24 })
        const items = res.data?.items ?? []
        if (cancelled) return
        setProjects(items)
        if (items[0]) navigate(`/projects/${items[0].id}/asset-library`, { replace: true })
      } catch {
        if (!cancelled) message.error('资产库入口加载失败，请检查后端服务')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [navigate])

  if (loading) {
    return <div className="flex h-full items-center justify-center bg-black"><Spin /></div>
  }

  return (
    <div className="relative flex h-full items-center justify-center bg-black px-8 text-white">
      <div className="nuwa-deep-space pointer-events-none fixed inset-0" />
      <div className="relative max-w-[520px] rounded-[28px] border border-white/12 bg-black p-10 text-center shadow-[0_0_42px_rgba(125,211,252,.12)]">
        <AppstoreOutlined className="text-4xl text-white" />
        <h1 className="mt-4 text-2xl font-semibold">选择一个项目资产库</h1>
        <p className="mt-3 text-sm leading-relaxed text-white/52">
          女娲资产库是项目级能力。请选择一个画布项目进入角色、圣经、音色与场景卡片视图。
        </p>
        {projects.length ? (
          <div className="mt-6 grid gap-2">
            {projects.map((project) => (
              <Button key={project.id} className="!border-white/12 !bg-black !text-white" onClick={() => navigate(`/projects/${project.id}/asset-library`)}>
                {project.name}
              </Button>
            ))}
          </div>
        ) : (
          <Empty className="mt-6" description={<span className="text-white/52">还没有项目画布</span>} />
        )}
      </div>
    </div>
  )
}

export default ProjectAssetLibraryEntry
