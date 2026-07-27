import { AppstoreOutlined, HomeOutlined, PlaySquareOutlined, ProjectOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import { useLocation, useNavigate } from 'react-router-dom'

const items = [
  { key: 'home', label: '主页', icon: <HomeOutlined />, href: '/projects' },
  { key: 'projects', label: '项目', icon: <ProjectOutlined />, href: '/canvases' },
  { key: 'assets', label: '资产库', icon: <AppstoreOutlined />, href: '/asset-library' },
  { key: 'community', label: '社区TV', icon: <PlaySquareOutlined />, href: '/community-tv' },
]

/** 工作台内侧导航：与全局侧栏保持同一入口顺序和深空黑视觉。 */
export function LeftNav() {
  const navigate = useNavigate()
  const location = useLocation()

  /** 根据当前路由给对应入口加弱高亮，避免项目内导航失焦。 */
  const getActive = (key: string) => {
    if (key === 'home') return location.pathname === '/projects'
    if (key === 'projects') return location.pathname.startsWith('/projects/') || location.pathname.startsWith('/canvases')
    if (key === 'assets') return location.pathname.startsWith('/asset-library')
    if (key === 'community') return location.pathname.startsWith('/community-tv')
    return false
  }

  return (
    <aside className="flex min-h-0 flex-col bg-black px-3 py-4 text-white">
      <div className="mb-5 flex h-10 items-center gap-2 px-2 text-sm font-semibold">
        <img src="/nuwa-logo.svg" alt="女娲" className="h-8 w-8 rounded-xl shadow-[0_0_18px_rgba(125,211,252,.16)]" />
        <span className="truncate text-white">女娲</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {items.map((item) => {
          const active = getActive(item.key)
          return (
            <Button
              key={item.key}
              type="text"
              icon={item.icon}
              className={`nuwa-workbench-side-link justify-start !border-0 !bg-black !text-white ${
                active ? 'nuwa-workbench-side-link-active' : ''
              }`}
              onClick={() => navigate(item.href)}
            >
              {item.label}
            </Button>
          )
        })}
      </div>
    </aside>
  )
}
