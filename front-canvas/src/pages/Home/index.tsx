import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Empty, Spin, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { StudioProjectsService } from '../../services/generated'
import type { ProjectRead } from '../../services/generated'
import './home.css'

/** 首页：只有一个"创建画布"按钮（彩虹流光），点击即建 project 并进入画布。
 *  下方是最近画布列表，方便回到已建好的画布 —— 后端没有独立的"canvas"实体，
 *  这里以 project 一对一代表一张画布（已在交付说明中如实标注为已知简化）。 */
export default function Home() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<ProjectRead[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    let alive = true
    StudioProjectsService.listProjectsApiV1StudioProjectsGet({ page: 1, pageSize: 24, order: 'created_at', isDesc: true })
      .then((res) => {
        if (alive) setProjects(res.data?.items ?? [])
      })
      .catch(() => void 0)
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  const createCanvas = async () => {
    setCreating(true)
    try {
      const id = crypto.randomUUID()
      const res = await StudioProjectsService.createProjectApiV1StudioProjectsPost({
        requestBody: {
          id,
          name: '未命名画布',
          style: '真人都市',
          visual_style: '现实',
          default_video_ratio: '16:9',
        },
      })
      const projectId = res.data?.id ?? id
      navigate(`/canvas/${projectId}`)
    } catch (e) {
      message.error('创建画布失败，请检查后端是否已在 127.0.0.1:8000 运行')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="nw-home">
      <div className="nw-home-hero">
        <div className="nw-home-logo">女娲</div>
        <div className="nw-home-tag">无限画布 · 从一句话到一支短剧</div>
        <button className="nw-rainbow-btn" onClick={createCanvas} disabled={creating}>
          <PlusOutlined /> {creating ? '创建中…' : '创建画布'}
        </button>
      </div>

      <div className="nw-home-list">
        <div className="nw-home-list-title">最近的画布</div>
        {loading ? (
          <Spin />
        ) : projects.length === 0 ? (
          <Empty description="还没有画布，点击上方按钮创建第一个" />
        ) : (
          <div className="nw-home-grid">
            {projects.map((p) => (
              <div key={p.id} className="nw-home-card" onClick={() => navigate(`/canvas/${p.id}`)}>
                <div className="nw-home-card-name">{p.name || '未命名画布'}</div>
                <div className="nw-home-card-meta">{p.style}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
