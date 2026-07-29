import { useEffect, useMemo, useState } from 'react'
import type React from 'react'
import { FireOutlined, TrophyOutlined, UserOutlined } from '@ant-design/icons'
import { Empty, Spin, Tag } from 'antd'
import { StudioProjectsService, type ProjectRead } from '../../../services/generated'

/** 作品热度排行榜：本批只做榜单 UI 与展示结构，不含评分、奖励、反作弊。 */
const HotRanking: React.FC = () => {
  const [projects, setProjects] = useState<ProjectRead[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const res = await StudioProjectsService.listProjectsApiV1StudioProjectsGet({ page: 1, pageSize: 30 })
        if (!cancelled) setProjects(res.data?.items ?? [])
      } catch {
        if (!cancelled) setProjects([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const rows = useMemo(() => {
    return projects
      .map((project, index) => {
        const stats = (project.stats ?? {}) as Record<string, unknown>
        const heat = Number(stats.heat_score ?? 0) || Math.max(1, project.progress ?? 0) * 97 + Math.max(0, projects.length - index) * 13
        return {
          id: project.id,
          title: project.name,
          creator: String(stats.creator_name || stats.author_name || '张毅团队'),
          heat,
          description: project.description || '女娲创作画布作品',
        }
      })
      .sort((a, b) => b.heat - a.heat)
  }, [projects])

  return (
    <div className="relative min-h-full overflow-y-auto bg-black px-8 py-8 text-white">
      <div className="nuwa-deep-space pointer-events-none fixed inset-0" />
      <section className="relative mx-auto max-w-[1120px]">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-white/52">
              <FireOutlined />
              作品热度榜
            </div>
            <h1 className="mt-2 text-4xl font-semibold tracking-normal text-white">热度排行榜</h1>
          </div>
          <Tag className="mr-0 rounded-full border-white/14 bg-black px-4 py-1.5 text-white">展示结构版</Tag>
        </div>

        {loading ? (
          <div className="flex min-h-[360px] items-center justify-center"><Spin /></div>
        ) : rows.length === 0 ? (
          <Empty description={<span className="text-white/52">暂无榜单作品</span>} />
        ) : (
          <div className="grid gap-3">
            {rows.map((row, index) => (
              <article key={row.id} className="grid grid-cols-[72px_1fr_auto] items-center gap-4 rounded-[24px] border border-white/12 bg-black p-5 shadow-[0_0_36px_rgba(125,211,252,.08)]">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/14 bg-white/[.05] text-2xl font-semibold">
                  {index < 3 ? <TrophyOutlined /> : index + 1}
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold text-white">{row.title}</h2>
                  <div className="mt-2 flex items-center gap-2 text-sm text-white/48">
                    <UserOutlined />
                    <span>创作者：{row.creator}</span>
                  </div>
                  <p className="mt-2 line-clamp-1 text-sm text-white/36">{row.description}</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-semibold text-white">{row.heat}</div>
                  <div className="text-xs text-white/42">heat</div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default HotRanking
