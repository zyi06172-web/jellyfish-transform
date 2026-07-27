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
    <div className="flova-shell-bg flex h-screen overflow-hidden bg-black text-white">
      <aside className="relative z-20 flex w-[96px] shrink-0 flex-col items-center bg-transparent px-3 py-6">
        <Link to="/projects" className="mb-9 flex flex-col items-center gap-2 no-underline hover:no-underline">
          <img src="/nuwa-logo.svg" alt="女娲" className="h-12 w-12 rounded-[18px] shadow-[0_0_22px_rgba(120,220,255,.18)]" />
          <span className="text-[10px] font-semibold tracking-normal text-white/66">女娲</span>
        </Link>

        <nav className="flex w-full flex-col items-center gap-3">
          {navItems.map((item) => {
            const active = activeKey === item.key
            return (
              <Link
                key={item.key}
                to={item.href}
                className={`group flex w-full flex-col items-center gap-1.5 rounded-[22px] px-2 py-2.5 text-center no-underline transition hover:no-underline ${
                  active
                    ? 'bg-white/[.10] text-white shadow-[0_0_22px_rgba(120,220,255,.13)]'
                    : 'text-white/42 hover:bg-white/[.06] hover:text-white/78'
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
