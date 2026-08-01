import { useEffect, useRef } from 'react'
import {
  FileTextOutlined,
  PictureOutlined,
  VideoCameraOutlined,
  AudioOutlined,
  UploadOutlined,
  UserOutlined,
  EnvironmentOutlined,
  GiftOutlined,
  BulbOutlined,
} from '@ant-design/icons'
import './addNodeMenu.css'

export interface AddNodeChoice {
  kind: string
  label: string
  icon: React.ReactNode
}

/** §5 精简后的固定菜单（删 3D / 图文设计 / 输入文本 / 画板；留便签 + 上传）。 */
const GENERIC_CREATE: AddNodeChoice[] = [
  { kind: 'text', label: '创建文本', icon: <FileTextOutlined /> },
  { kind: 'image', label: '创建图片', icon: <PictureOutlined /> },
  { kind: 'video', label: '创建视频', icon: <VideoCameraOutlined /> },
  { kind: 'audio', label: '创建音频', icon: <AudioOutlined /> },
]

const DRAMA_CREATE: AddNodeChoice[] = [
  { kind: 'script', label: '剧本节点', icon: <FileTextOutlined /> },
  { kind: 'script_breakdown', label: '分镜脚本生成', icon: <FileTextOutlined /> },
  { kind: 'character', label: '角色资产', icon: <UserOutlined /> },
  { kind: 'location', label: '场景资产', icon: <EnvironmentOutlined /> },
  { kind: 'prop', label: '道具资产', icon: <GiftOutlined /> },
  { kind: 'storyboard', label: '手绘故事板', icon: <PictureOutlined /> },
]

const RESOURCE_CREATE: AddNodeChoice[] = [
  { kind: 'sticky', label: '便签', icon: <BulbOutlined /> },
  { kind: 'upload', label: '上传', icon: <UploadOutlined /> },
]

interface AddNodeMenuProps {
  x: number
  y: number
  onPick: (kind: string) => void
  onClose: () => void
  /** 从连接点拖出后落在空白处时，只允许创建并自动连线，标题略有不同 */
  connectMode?: boolean
}

export function AddNodeMenu({ x, y, onPick, onClose, connectMode }: AddNodeMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', esc)
    }
  }, [onClose])

  return (
    <div className="nw-add-menu" style={{ left: x, top: y }} ref={ref}>
      <div className="nw-add-menu-group-title">{connectMode ? '引用该节点 / 添加节点' : '添加节点'}</div>
      <div className="nw-add-menu-grid">
        {GENERIC_CREATE.map((c) => (
          <div key={c.kind} className="nw-add-menu-item" onClick={() => onPick(c.kind)}>
            {c.icon}
            <span>{c.label}</span>
          </div>
        ))}
      </div>

      <div className="nw-add-menu-group-title">短剧工作流节点</div>
      <div className="nw-add-menu-grid">
        {DRAMA_CREATE.map((c) => (
          <div key={c.kind} className="nw-add-menu-item" onClick={() => onPick(c.kind)}>
            {c.icon}
            <span>{c.label}</span>
          </div>
        ))}
      </div>

      <div className="nw-add-menu-group-title">添加资源</div>
      <div className="nw-add-menu-grid">
        {RESOURCE_CREATE.map((c) => (
          <div key={c.kind} className="nw-add-menu-item" onClick={() => onPick(c.kind)}>
            {c.icon}
            <span>{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
