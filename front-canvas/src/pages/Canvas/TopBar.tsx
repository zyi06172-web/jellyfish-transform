import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dropdown, Modal, Select, message } from 'antd'
import {
  MoonOutlined,
  SunOutlined,
  SettingOutlined,
  MessageOutlined,
  MenuUnfoldOutlined,
  PlusOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons'
import { useUiStore } from '../../state/uiStore'
import { StudioProjectsService } from '../../services/generated'
import type { ProjectRead } from '../../services/generated'
import { CANVAS_TYPE_CONFIGS } from '../../types/canvasTypeConfig'
import type { CanvasType } from '../../types/canvas'
import { ASPECT_RATIOS, RESOLUTIONS } from '../../types/canvas'
import './topbar.css'

interface TopBarProps {
  projectId: string
  project: ProjectRead | null
  onProjectUpdated: (p: ProjectRead) => void
}

/** 顶栏（计划书 §2）：logo/画布类型/项目名可改/版本号/资产库开关 —— 积分(女娲图标)+充值/
 *  设置/明暗/聊天开关。 */
export function TopBar({ projectId, project, onProjectUpdated }: TopBarProps) {
  const navigate = useNavigate()
  const theme = useUiStore((s) => s.theme)
  const toggleTheme = useUiStore((s) => s.toggleTheme)
  const canvasType = useUiStore((s) => s.canvasType)
  const setCanvasType = useUiStore((s) => s.setCanvasType)
  const projectName = useUiStore((s) => s.projectName)
  const setProjectNameLocal = useUiStore((s) => s.setProjectName)
  const toggleAssetDrawer = useUiStore((s) => s.toggleAssetDrawer)
  const toggleChatPanel = useUiStore((s) => s.toggleChatPanel)
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen)
  const credits = useUiStore((s) => s.credits)
  const rechargeOpen = useUiStore((s) => s.rechargeOpen)
  const setRechargeOpen = useUiStore((s) => s.setRechargeOpen)
  const cumulativeCostCny = useUiStore((s) => s.cumulativeCostCny)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(projectName)

  const commitName = async () => {
    setEditingName(false)
    const next = nameDraft.trim() || '未命名画布'
    setProjectNameLocal(next)
    try {
      const res = await StudioProjectsService.updateProjectApiV1StudioProjectsProjectIdPatch({ projectId, requestBody: { name: next } })
      if (res.data) onProjectUpdated(res.data)
    } catch {
      message.error('改名保存失败（本地已改，稍后会重试）')
    }
  }

  const changeRatio = async (ratio: string) => {
    try {
      const res = await StudioProjectsService.updateProjectApiV1StudioProjectsProjectIdPatch({
        projectId,
        requestBody: { default_video_ratio: ratio },
      })
      if (res.data) onProjectUpdated(res.data)
    } catch {
      message.error('比例保存失败')
    }
  }

  const canvasTypeMenu = {
    items: (Object.keys(CANVAS_TYPE_CONFIGS) as CanvasType[]).map((t) => ({ key: t, label: CANVAS_TYPE_CONFIGS[t].label })),
    onClick: ({ key }: { key: string }) => setCanvasType(key as CanvasType),
  }

  return (
    <div className="nw-topbar">
      <div className="nw-topbar-left">
        <button className="nw-icon-btn" onClick={() => navigate('/')} title="返回首页">
          <ArrowLeftOutlined />
        </button>
        <div className="nw-topbar-logo">女娲</div>
        <Dropdown menu={canvasTypeMenu} trigger={['click']}>
          <button className="nw-btn nw-btn-secondary nw-topbar-typebtn">{CANVAS_TYPE_CONFIGS[canvasType].label} ▾</button>
        </Dropdown>
        {editingName ? (
          <input
            autoFocus
            className="nw-topbar-name-input"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => e.key === 'Enter' && commitName()}
          />
        ) : (
          <div className="nw-topbar-name" onClick={() => setEditingName(true)}>
            {projectName}
          </div>
        )}
        <span className="nw-topbar-version">v1.0.0</span>
        <button className="nw-icon-btn" onClick={toggleAssetDrawer} title="资产库">
          <MenuUnfoldOutlined />
        </button>
        <Select
          size="small"
          value={project?.default_video_ratio || '16:9'}
          style={{ width: 90 }}
          onChange={changeRatio}
          options={ASPECT_RATIOS.map((r) => ({ value: r, label: r }))}
        />
        <Select size="small" defaultValue="1080P" style={{ width: 90 }} options={RESOLUTIONS.map((r) => ({ value: r, label: r }))} />
      </div>

      <div className="nw-topbar-right">
        <span className="nw-topbar-spend">本画布累计花费 ≈¥{cumulativeCostCny.toFixed(2)}（预估）</span>
        <button className="nw-topbar-credits" onClick={() => setRechargeOpen(true)}>
          女娲积分 {credits} <PlusOutlined />
        </button>
        <button className="nw-icon-btn" onClick={() => setSettingsOpen(true)} title="设置">
          <SettingOutlined />
        </button>
        <button className="nw-icon-btn" onClick={toggleTheme} title="明暗切换">
          {theme === 'light' ? <MoonOutlined /> : <SunOutlined />}
        </button>
        <button className="nw-icon-btn" onClick={toggleChatPanel} title="引导面板">
          <MessageOutlined />
        </button>
      </div>

      <Modal open={rechargeOpen} onCancel={() => setRechargeOpen(false)} footer={null} title="充值">
        <p>充值页 UI 交给设计，这里是占位页；接口暂未接入，不产生真实扣费。</p>
      </Modal>
    </div>
  )
}
