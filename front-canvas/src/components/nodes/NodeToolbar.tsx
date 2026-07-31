import { Tooltip } from 'antd'
import type { ToolbarItem } from './NodeChrome'
import './nodeToolbar.css'

/** 选中时浮出的圆角操作条（计划书 §4.2④）。只在 selected 时渲染，不选中不占位、不遮挡。 */
export function NodeToolbar({ items, visible }: { items: ToolbarItem[]; visible: boolean }) {
  if (!visible || items.length === 0) return null
  return (
    <div className="nw-floating-toolbar">
      {items.map((t) => (
        <Tooltip title={t.tooltip} key={t.key}>
          <button className={`nw-icon-btn ${t.danger ? 'danger' : ''}`} onClick={t.onClick}>
            {t.icon}
          </button>
        </Tooltip>
      ))}
    </div>
  )
}
