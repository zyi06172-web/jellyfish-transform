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
    <aside className="flex min-h-0 flex-col border-r border-black/6 bg-[#f5f5f7] px-3 py-4">
      <div className="mb-5 flex h-10 items-center gap-2 px-2 text-sm font-semibold">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1d1d1f] text-white">F</span>
        <span className="truncate">Flova</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {items.map((item) => (
          <Button
            key={item.key}
            type={item.key === 'projects' ? 'primary' : 'text'}
            icon={item.icon}
            className="justify-start"
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
