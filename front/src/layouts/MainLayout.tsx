import React, { useMemo } from 'react'
import { HomeOutlined, PlaySquareOutlined, ProjectOutlined } from '@ant-design/icons'
import { Link, Outlet, useLocation } from 'react-router-dom'

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

/** 极简全局外壳：去掉传统后台顶部栏和任务中心，让主页/工作台拥有完整画布。 */
const MainLayout: React.FC = () => {
  const location = useLocation()

  const activeKey = useMemo(() => {
    if (location.pathname.startsWith('/community-tv')) return 'tv'
    if (location.pathname === '/projects') return 'home'
    if (location.pathname.startsWith('/projects/')) return 'projects'
    return 'home'
  }, [location.pathname])

  return (
    <div className="flex h-screen overflow-hidden bg-[#f5f5f7] text-[#1d1d1f]">
      <aside className="relative z-20 flex w-[104px] shrink-0 flex-col items-center border-r border-black/5 bg-white/72 px-3 py-6 shadow-[18px_0_60px_rgba(0,0,0,.05)] backdrop-blur-2xl">
        <Link to="/projects" className="mb-9 flex flex-col items-center gap-2 no-underline hover:no-underline">
          <img src="/logo.svg" alt="短剧工厂" className="h-12 w-12 rounded-[18px]" />
          <span className="text-[11px] font-semibold tracking-normal text-black/50">短剧工厂</span>
        </Link>

        <nav className="flex w-full flex-col items-center gap-4">
          {navItems.map((item) => {
            const active = activeKey === item.key
            return (
              <Link
                key={item.key}
                to={item.href}
                className={`group flex w-full flex-col items-center gap-2 rounded-[24px] px-2 py-3 text-center no-underline transition hover:no-underline ${
                  active ? 'bg-black text-white shadow-xl shadow-black/10' : 'text-black/42 hover:bg-black/[.045] hover:text-black/72'
                }`}
              >
                <span className="text-[25px] leading-none">{item.icon}</span>
                <span className="text-xs font-semibold">{item.label}</span>
              </Link>
            )
          })}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}

export default MainLayout
