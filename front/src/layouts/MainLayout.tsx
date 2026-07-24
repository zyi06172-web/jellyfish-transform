import React, { useMemo } from 'react'
import { GiftOutlined, HomeOutlined, PlaySquareOutlined, ProjectOutlined } from '@ant-design/icons'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { TaskCenter } from '../pages/aiStudio/components/TaskCenter'
import { TaskRuntimeProvider } from '../pages/aiStudio/components/TaskRuntimeProvider'

type NavItem = {
  key: string
  label: string
  href: string
  icon: React.ReactNode
}

const navItems: NavItem[] = [
  { key: 'home', label: 'ホーム', href: '/projects', icon: <HomeOutlined /> },
  { key: 'projects', label: 'プロジェクト', href: '/projects', icon: <ProjectOutlined /> },
  { key: 'tv', label: '社区TV', href: '/community-tv', icon: <PlaySquareOutlined /> },
]

/** Flova 型全局外壳：只保留左侧核心导航，业务页面独占主区域。 */
const MainLayout: React.FC = () => {
  const location = useLocation()

  const activeKey = useMemo(() => {
    if (location.pathname.startsWith('/community-tv')) return 'tv'
    if (location.pathname === '/projects') return 'home'
    if (location.pathname.startsWith('/projects/')) return 'projects'
    return 'home'
  }, [location.pathname])

  return (
    <div className="flex h-screen overflow-hidden bg-[#050505] text-white">
      <aside className="flex w-[108px] shrink-0 flex-col items-center border-r border-white/8 bg-[#070707] py-7">
        <Link to="/projects" className="mb-10 flex items-center justify-center">
          <img src="/logo.svg" alt="Flova" className="h-11 w-11" />
        </Link>

        <nav className="flex w-full flex-col items-center gap-7">
          {navItems.map((item) => {
            const active = activeKey === item.key
            return (
              <Link
                key={item.key}
                to={item.href}
                className={`flex w-full flex-col items-center gap-2 text-center transition ${
                  active ? 'text-white' : 'text-white/42 hover:text-white/72'
                }`}
              >
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-2xl text-3xl ${
                    active ? 'bg-white/10 ring-1 ring-white/18' : ''
                  }`}
                >
                  {item.icon}
                </span>
                <span className="text-sm font-semibold">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="mt-auto flex flex-col items-center gap-5 text-white/42">
          <div className="h-px w-8 bg-white/12" />
          <GiftOutlined className="rounded-full bg-white/10 p-2 text-4xl text-[#ffd28a]" />
        </div>
      </aside>

      <TaskRuntimeProvider>
        <main className="min-w-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
        <TaskCenter />
      </TaskRuntimeProvider>
    </div>
  )
}

export default MainLayout
