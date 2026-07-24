import React, { useMemo } from 'react'
import { HomeOutlined, PlaySquareOutlined, ProjectOutlined } from '@ant-design/icons'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { TaskRuntimeProvider } from '../pages/aiStudio/components/TaskRuntimeProvider'

type NavItem = {
  key: string
  label: string
  href: string
  icon: React.ReactNode
}

const navItems: NavItem[] = [
  { key: 'home', label: '主页', href: '/projects', icon: <HomeOutlined /> },
  { key: 'projects', label: '项目', href: '/projects', icon: <ProjectOutlined /> },
  { key: 'tv', label: '社区TV', href: '/community-tv', icon: <PlaySquareOutlined /> },
]

/** 极简全局外壳：隐藏可见任务中心，同时保留任务运行上下文给业务页面使用。 */
const MainLayout: React.FC = () => {
  const location = useLocation()

  const activeKey = useMemo(() => {
    if (location.pathname.startsWith('/community-tv')) return 'tv'
    if (location.pathname === '/projects') return 'home'
    if (location.pathname.startsWith('/projects/')) return 'projects'
    return 'home'
  }, [location.pathname])

  return (
    <div className="flova-shell-bg flex h-screen overflow-hidden bg-[#f6f1e8] text-[#1d1d1f]">
      <aside className="relative z-20 flex w-[96px] shrink-0 flex-col items-center border-r border-white/25 bg-[#f6f1e8]/35 px-3 py-6 shadow-[10px_0_46px_rgba(120,88,52,.026)] backdrop-blur-3xl">
        <Link to="/projects" className="mb-9 flex flex-col items-center gap-2 no-underline hover:no-underline">
          <img src="/logo.svg" alt="短剧工厂" className="h-10 w-10 rounded-2xl shadow-[0_10px_26px_rgba(120,88,52,.08)]" />
          <span className="text-[10px] font-semibold tracking-normal text-black/45">短剧工厂</span>
        </Link>

        <nav className="flex w-full flex-col items-center gap-3">
          {navItems.map((item) => {
            const active = activeKey === item.key
            return (
              <Link
                key={item.key}
                to={item.href}
                className={`group flex w-full flex-col items-center gap-1.5 rounded-[22px] px-2 py-2.5 text-center no-underline transition hover:no-underline ${
                  active ? 'bg-black text-white shadow-lg shadow-black/10' : 'text-black/40 hover:bg-black/[.04] hover:text-black/70'
                }`}
              >
                <span className="text-[21px] leading-none">{item.icon}</span>
                <span className="text-[11px] font-semibold">{item.label}</span>
              </Link>
            )
          })}
        </nav>
      </aside>

      <TaskRuntimeProvider>
        <main className="min-w-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </TaskRuntimeProvider>
    </div>
  )
}

export default MainLayout
