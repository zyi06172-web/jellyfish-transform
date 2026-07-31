import { Tooltip, message } from 'antd'
import { CAMERA_PRESETS } from '../../types/canvas'
import './presetBar.css'

const QUICK_PRESETS = [
  { key: 'character_four_view', label: '角色四视图生成' },
  { key: 'prop_sheet', label: '道具资产图生成' },
  { key: 'location_sheet', label: '场景资产图生成' },
] as const

/** 顶栏预设/相机按钮（计划书 §12.4）：全部"可选覆盖项"，默认 AI 全自动，非必填。
 *  相机按钮的实际参数不展示给用户，只在后台写入提示词。 */
export function PresetBar() {
  const runPreset = (label: string) => {
    message.info(`已记录「${label}」偏好，下一次在右侧对话框生成对应资产时会优先采用（不强制打断当前对话）`)
  }

  const runCamera = (label: string) => {
    message.info(`「${label}」已加入下一次生成的镜头语言偏好`)
  }

  return (
    <div className="nw-presetbar">
      <div className="nw-presetbar-group">
        {QUICK_PRESETS.map((p) => (
          <button key={p.key} className="nw-btn nw-btn-secondary nw-preset-btn" onClick={() => runPreset(p.label)}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="nw-presetbar-divider" />
      <div className="nw-presetbar-group">
        {CAMERA_PRESETS.map((c) => (
          <Tooltip key={c.key} title={c.hint}>
            <button className="nw-btn nw-btn-secondary nw-preset-btn" onClick={() => runCamera(c.label)}>
              {c.label}
            </button>
          </Tooltip>
        ))}
      </div>
    </div>
  )
}
