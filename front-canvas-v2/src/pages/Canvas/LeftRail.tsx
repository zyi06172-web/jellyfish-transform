import { Tooltip } from 'antd'
import {
  PlusOutlined,
  AppstoreOutlined,
  BuildOutlined,
  HistoryOutlined,
} from '@ant-design/icons'
import { useUiStore } from '../../state/uiStore'
import './leftRail.css'

/** 迪士尼卡通风格 + 科技感的眼睛：大而圆润、双高光有神；虹膜带青色科技环与径向渐变。 */
function BallEyes() {
  return (
    <svg className="nw-ball-eyes" viewBox="0 0 46 46" width="46" height="46" aria-hidden>
      <defs>
        <radialGradient id="nw-iris" cx="50%" cy="42%" r="60%">
          <stop offset="0%" stopColor="#7fe9ff" />
          <stop offset="45%" stopColor="#1b6bff" />
          <stop offset="100%" stopColor="#0a1740" />
        </radialGradient>
      </defs>
      {/* 左眼 */}
      <g>
        <ellipse cx="17.5" cy="22" rx="6.4" ry="7.4" fill="#ffffff" />
        <circle cx="18.4" cy="23.2" r="4.1" fill="url(#nw-iris)" />
        <circle cx="18.4" cy="23.2" r="4.1" fill="none" stroke="#8ff3ff" strokeWidth="0.7" opacity="0.9" />
        <circle cx="18.4" cy="23.2" r="1.7" fill="#04102e" />
        <circle cx="16.9" cy="21.4" r="1.5" fill="#ffffff" />
        <circle cx="20" cy="24.6" r="0.7" fill="#ffffff" opacity="0.85" />
      </g>
      {/* 右眼 */}
      <g>
        <ellipse cx="30" cy="21.6" rx="6.4" ry="7.4" fill="#ffffff" />
        <circle cx="29.1" cy="22.8" r="4.1" fill="url(#nw-iris)" />
        <circle cx="29.1" cy="22.8" r="4.1" fill="none" stroke="#8ff3ff" strokeWidth="0.7" opacity="0.9" />
        <circle cx="29.1" cy="22.8" r="1.7" fill="#04102e" />
        <circle cx="27.6" cy="21" r="1.5" fill="#ffffff" />
        <circle cx="30.7" cy="24.2" r="0.7" fill="#ffffff" opacity="0.85" />
      </g>
    </svg>
  )
}

/** §1.3 左侧竖排工具栏（替代已删除的顶栏）。从上到下：
 *  白色圆形加号 → 资产库 → 预设工作流 → 历史记录 → 分隔线 → agent 小球（底部）。 */
export function LeftRail() {
  const activePanel = useUiStore((s) => s.activePanel)
  const togglePanel = useUiStore((s) => s.togglePanel)
  const setRailAddMenu = useUiStore((s) => s.setRailAddMenu)
  const agentOpen = useUiStore((s) => s.agentOpen)
  const toggleAgent = useUiStore((s) => s.toggleAgent)

  const openAddMenu = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setRailAddMenu({ x: rect.right + 12, y: rect.top })
  }

  return (
    <div className="nw-rail">
      <Tooltip title="添加节点" placement="right">
        <button className="nw-rail-add" onClick={openAddMenu}>
          <PlusOutlined />
        </button>
      </Tooltip>

      <div className="nw-rail-group">
        <Tooltip title="资产库" placement="right">
          <button className={`nw-rail-btn ${activePanel === 'assets' ? 'active' : ''}`} onClick={() => togglePanel('assets')}>
            <AppstoreOutlined />
          </button>
        </Tooltip>
        <Tooltip title="预设工作流" placement="right">
          <button className={`nw-rail-btn ${activePanel === 'presets' ? 'active' : ''}`} onClick={() => togglePanel('presets')}>
            <BuildOutlined />
          </button>
        </Tooltip>
        <Tooltip title="历史记录" placement="right">
          <button className={`nw-rail-btn ${activePanel === 'history' ? 'active' : ''}`} onClick={() => togglePanel('history')}>
            <HistoryOutlined />
          </button>
        </Tooltip>
      </div>

      <div className="nw-rail-divider" />

      <Tooltip title="女娲 · Agent" placement="right">
        <button className={`nw-rail-ball ${agentOpen ? 'active' : ''}`} onClick={toggleAgent} aria-label="女娲 Agent">
          {/* 彩虹流光小球 + 迪士尼卡通风格的科技感眼睛，球上无文字（附加要求） */}
          <BallEyes />
        </button>
      </Tooltip>
    </div>
  )
}
