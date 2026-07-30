import { Tooltip } from 'antd'
import type { ToolbarItem } from '../../pages/Canvas/types'

/** NodeToolbar 只在节点选中时显示，承载节点级确认、重做、下载等操作。 */
export function NodeToolbar({ items }: { items: ToolbarItem[] }) {
  if (!items.length) return null
  return (
    <div className="nuwa-node-toolbar nodrag">
      {items.map((item) => (
        <Tooltip key={item.key} title={item.tooltip}>
          <button
            type="button"
            className={item.danger ? 'nuwa-node-toolbar-danger' : ''}
            onClick={(event) => {
              event.stopPropagation()
              item.onClick()
            }}
          >
            {item.icon}
          </button>
        </Tooltip>
      ))}
    </div>
  )
}
