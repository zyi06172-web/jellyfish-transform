import { useEffect, useRef } from 'react'
import {
  FileTextOutlined,
  PictureOutlined,
  VideoCameraOutlined,
  AudioOutlined,
  BorderOutlined,
  LayoutOutlined,
  UploadOutlined,
  FormOutlined,
  UserOutlined,
  EnvironmentOutlined,
  GiftOutlined,
} from '@ant-design/icons'
import type { CanvasType } from '../../types/canvas'
import './addNodeMenu.css'

export interface AddNodeChoice {
  kind: string
  label: string
  icon: React.ReactNode
}

const GENERIC_CREATE: AddNodeChoice[] = [
  { kind: 'text', label: '创建文本', icon: <FileTextOutlined /> },
  { kind: 'image', label: '创建图片', icon: <PictureOutlined /> },
  { kind: 'video', label: '创建视频', icon: <VideoCameraOutlined /> },
  { kind: 'audio', label: '创建音频', icon: <AudioOutlined /> },
  { kind: '3d', label: '创建 3D（占位）', icon: <BorderOutlined /> },
  { kind: 'graphic_design', label: '图文设计（占位）', icon: <LayoutOutlined /> },
]

const RESOURCE_CREATE: AddNodeChoice[] = [
  { kind: 'input_text', label: '输入文本', icon: <FormOutlined /> },
  { kind: 'board', label: '画板', icon: <BorderOutlined /> },
  { kind: 'sticky', label: '便签', icon: <FormOutlined /> },
  { kind: 'upload', label: '上传', icon: <UploadOutlined /> },
]

const DRAMA_CREATE: AddNodeChoice[] = [
  { kind: 'script', label: '剧本节点', icon: <FileTextOutlined /> },
  { kind: 'character', label: '角色资产', icon: <UserOutlined /> },
  { kind: 'location', label: '场景资产', icon: <EnvironmentOutlined /> },
  { kind: 'prop', label: '道具资产', icon: <GiftOutlined /> },
  { kind: 'storyboard', label: '手绘故事板', icon: <PictureOutlined /> },
]

const ECOMMERCE_CREATE: AddNodeChoice[] = [{ kind: 'product', label: '商品节点', icon: <GiftOutlined /> }]

interface AddNodeMenuProps {
  x: number
  y: number
  canvasType: CanvasType
  onPick: (kind: string) => void
  onClose: () => void
  /** 从连接点拖出后落在空白处时，只允许创建并自动连线，标题略有不同 */
  connectMode?: boolean
}

export function AddNodeMenu({ x, y, canvasType, onPick, onClose, connectMode }: AddNodeMenuProps) {
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
      {canvasType === 'aigc' && (
        <>
          <div className="nw-add-menu-group-title">短剧工作流节点</div>
          <div className="nw-add-menu-grid">
            {DRAMA_CREATE.map((c) => (
              <div key={c.kind} className="nw-add-menu-item" onClick={() => onPick(c.kind)}>
                {c.icon}
                <span>{c.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {canvasType === 'ecommerce' && (
        <>
          <div className="nw-add-menu-group-title">电商工作流节点</div>
          <div className="nw-add-menu-grid">
            {ECOMMERCE_CREATE.map((c) => (
              <div key={c.kind} className="nw-add-menu-item" onClick={() => onPick(c.kind)}>
                {c.icon}
                <span>{c.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {!connectMode && (
        <>
          <div className="nw-add-menu-group-title">添加资源</div>
          <div className="nw-add-menu-grid">
            {RESOURCE_CREATE.map((c) => (
              <div key={c.kind} className="nw-add-menu-item" onClick={() => onPick(c.kind)}>
                {c.icon}
                <span>{c.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
