import { HomeOutlined, PlaySquareOutlined, TeamOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import { useNavigate } from 'react-router-dom'

const items = [
  { key: 'home', label: '主页', icon: <HomeOutlined /> },
  { key: 'projects', label: '项目', icon: <PlaySquareOutlined /> },
  { key: 'community', label: '社区TV', icon: <TeamOutlined /> },
]

export function LeftNav() {
  const navigate = useNavigate()
  return (
    <aside className="flex min-h-0 flex-col bg-transparent px-3 py-4 text-white">
      <div className="mb-5 flex h-10 items-center gap-2 px-2 text-sm font-semibold">
        <img src="/nuwa-logo.svg" alt="女娲" className="h-8 w-8 rounded-xl shadow-[0_0_18px_rgba(125,211,252,.16)]" />
        <span className="truncate">女娲</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {items.map((item) => (
          <Button
            key={item.key}
            type="text"
            icon={item.icon}
            className={`justify-start !border-0 !text-white ${
              item.key === 'projects'
                ? '!bg-white/[.10] shadow-[0_0_18px_rgba(125,211,252,.12)]'
                : '!bg-transparent hover:!bg-white/[.06]'
            }`}
            onClick={() => {
              if (item.key === 'projects' || item.key === 'home') navigate('/projects')
            }}
          >
            {item.label}
          </Button>
        ))}
      </div>
    </aside>
  )
}
