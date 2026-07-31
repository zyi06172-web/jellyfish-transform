import { Modal, Tabs, Switch, Select, Input, List, Tag } from 'antd'
import { useUiStore } from '../../state/uiStore'
import { TEXT_MODELS, IMAGE_MODELS, VIDEO_MODELS } from '../../types/canvas'
import { BUILTIN_RECIPES } from '../../types/recipes'
import './settingsModal.css'

const SKILLS = [
  { key: 'drama_script_divider', name: '短剧剧本解析', desc: '严格忠实拆解故事构成/角色/分镜，不扩写', enabled: true },
  { key: 'drama_asset_bible', name: '角色圣经维护', desc: '维护角色外观/配饰穿戴规则', enabled: true },
  { key: 'drama_storyboard', name: '6格故事板生成', desc: '1秒1格，第6格空白规则', enabled: true },
  { key: 'ecommerce_product', name: '电商产品设定图', desc: '白底标准图规则（草案）', enabled: false },
]

/** 设置弹窗（计划书 §8）：结构照抄模板，内容换成女娲真实模型/skills/recipes。 */
export function SettingsModal() {
  const open = useUiStore((s) => s.settingsOpen)
  const setOpen = useUiStore((s) => s.setSettingsOpen)
  const settings = useUiStore((s) => s.settings)
  const patchSettings = useUiStore((s) => s.patchSettings)

  return (
    <Modal open={open} onCancel={() => setOpen(false)} onOk={() => setOpen(false)} width={720} title="设置" okText="确认">
      <Tabs
        tabPosition="left"
        items={[
          {
            key: 'general',
            label: '通用',
            children: (
              <div className="nw-settings-section">
                <div className="nw-settings-row">
                  <span>API Key（女娲密钥）</span>
                  <Input.Password
                    placeholder="用于自定义模型接入（可选）"
                    value={settings.apiKeyLabel}
                    onChange={(e) => patchSettings({ apiKeyLabel: e.target.value })}
                  />
                </div>
                <div className="nw-settings-row">
                  <span>显示性能监视面板</span>
                  <Switch checked={settings.showPerfMonitor} onChange={(v) => patchSettings({ showPerfMonitor: v })} />
                </div>
                <div className="nw-settings-row">
                  <span>自动布局方式</span>
                  <Switch checked={settings.autoLayout} onChange={(v) => patchSettings({ autoLayout: v })} />
                </div>
                <div className="nw-settings-row">
                  <span>提示词增强模型</span>
                  <Select
                    value={settings.promptEnhanceModel}
                    style={{ width: 220 }}
                    onChange={(v) => patchSettings({ promptEnhanceModel: v })}
                    options={TEXT_MODELS.map((m) => ({ value: m.id, label: m.label }))}
                  />
                </div>
                <div className="nw-settings-row">
                  <span>资产下载路径</span>
                  <Input value={settings.downloadPath} onChange={(e) => patchSettings({ downloadPath: e.target.value })} />
                </div>
              </div>
            ),
          },
          {
            key: 'network',
            label: '网络',
            children: <div className="nw-settings-section">直连 http://127.0.0.1:8000/api/v1（后端地址可用 VITE_BACKEND_URL 覆盖）。</div>,
          },
          {
            key: 'agent',
            label: 'Agent',
            children: (
              <div className="nw-settings-section">
                <div className="nw-settings-row">
                  <span>自动质量评估</span>
                  <Switch checked={settings.autoQualityCheck} onChange={(v) => patchSettings({ autoQualityCheck: v })} />
                </div>
                <div className="nw-settings-row">
                  <span>节点自动选位</span>
                  <Switch checked={settings.autoNodePlacement} onChange={(v) => patchSettings({ autoNodePlacement: v })} />
                </div>
                <div className="nw-settings-row">
                  <span>每步确认</span>
                  <Switch checked={settings.confirmEachStep} onChange={(v) => patchSettings({ confirmEachStep: v })} />
                </div>
                <div className="nw-settings-row">
                  <span>文本模型偏好</span>
                  <Select value={settings.modelPrefText} style={{ width: 220 }} onChange={(v) => patchSettings({ modelPrefText: v })} options={TEXT_MODELS.map((m) => ({ value: m.id, label: m.label }))} />
                </div>
                <div className="nw-settings-row">
                  <span>图像模型偏好</span>
                  <Select value={settings.modelPrefImage} style={{ width: 220 }} onChange={(v) => patchSettings({ modelPrefImage: v })} options={IMAGE_MODELS.map((m) => ({ value: m.id, label: m.label, disabled: !m.ready }))} />
                </div>
                <div className="nw-settings-row">
                  <span>视频模型偏好</span>
                  <Select value={settings.modelPrefVideo} style={{ width: 220 }} onChange={(v) => patchSettings({ modelPrefVideo: v })} options={VIDEO_MODELS.map((m) => ({ value: m.id, label: m.label, disabled: !m.ready }))} />
                </div>
              </div>
            ),
          },
          {
            key: 'skills',
            label: 'Skills',
            children: (
              <List
                dataSource={SKILLS}
                renderItem={(s) => (
                  <List.Item actions={[<Switch key="sw" defaultChecked={s.enabled} size="small" />]}>
                    <List.Item.Meta title={s.name} description={s.desc} />
                  </List.Item>
                )}
              />
            ),
          },
          {
            key: 'recipes',
            label: 'Recipes',
            children: (
              <List
                dataSource={BUILTIN_RECIPES}
                renderItem={(r) => (
                  <List.Item>
                    <List.Item.Meta
                      title={
                        <span>
                          {r.name} <Tag>可编辑</Tag>
                        </span>
                      }
                      description={
                        <>
                          <div>{r.usage}</div>
                          <Input.TextArea defaultValue={r.template} autoSize={{ minRows: 3, maxRows: 6 }} style={{ marginTop: 6, fontSize: 12 }} />
                        </>
                      }
                    />
                  </List.Item>
                )}
              />
            ),
          },
        ]}
      />
    </Modal>
  )
}
