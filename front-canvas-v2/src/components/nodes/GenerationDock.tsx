import { useMemo, useRef, useState } from 'react'
import { Modal, Select, Tooltip, message } from 'antd'
import { useCanvasFlow } from '../../pages/Canvas/CanvasFlowContext'
import { ExpandOutlined, SendOutlined } from '@ant-design/icons'
import { useUiStore } from '../../state/uiStore'
import { useProjectSettings } from '../../state/projectContext'
import { useUpstream } from '../../pages/Canvas/hooks/useUpstream'
import { generateImageFromPrompt } from '../../services/imageGen'
import { analysisFromUpstream, finalAssetPrompt, rowsFromScript, analyzeScriptLocally } from '../../services/promptIntelligence'
import {
  ASPECT_RATIOS,
  AUDIO_MODELS,
  GEN_COUNTS,
  IMAGE_MODELS,
  AIGC_IMAGE_PRESETS,
  QUALITY_PRESETS,
  TEXT_MODELS,
  VIDEO_DURATIONS,
  VIDEO_MODELS,
  type NodeKind,
} from '../../types/canvas'
import { RatioIcon } from './RatioIcon'
import { nodeWidthOf } from '../../pages/Canvas/hooks/useNodeOperations'
import './generationDock.css'

interface GenerationDockProps {
  nodeId: string
  kind: Extract<NodeKind, 'text' | 'image' | 'video' | 'audio'>
  onSubmit: (dialogState: Record<string, unknown>) => void
}

const PLACEHOLDER = '输入描述（Enter 换行，Ctrl/⌘+Enter 提交，/ 引用提示词，@ 引用节点）'

/** 贴底大对话框：点节点出、切节点保留态 —— 数据存在该节点自己的 data.dialog 里（受控组件）。
 *  §3 积分移到左上、真实余额、可点击开充值；§9 视频时长 5/10/15、生成数量/音频框加宽。
 *  图片节点会真正调用火山 Seedream 出图（imageGen），电商预设工作流依赖这条链路。 */
export function GenerationDock({ nodeId, kind, onSubmit }: GenerationDockProps) {
  const { nodes, setNodes } = useCanvasFlow()
  const node = nodes.find((n) => n.id === nodeId)
  const setFullscreen = useUiStore((s) => s.setFullscreenPromptNodeId)
  const credits = useUiStore((s) => s.credits)
  const spendCredits = useUiStore((s) => s.spendCredits)
  const setRechargeOpen = useUiStore((s) => s.setRechargeOpen)
  const { project } = useProjectSettings()
  const { upstreamOf } = useUpstream()
  const [refMenuOpen, setRefMenuOpen] = useState(false)
  const [nodeRefMenuOpen, setNodeRefMenuOpen] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)

  const dialog = (node?.data?.dialog as Record<string, unknown>) ?? {}

  const patchDialog = (patch: Record<string, unknown>) => {
    setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, dialog: { ...(n.data.dialog as object), ...patch } } } : n)))
  }
  const patchNode = (patch: Record<string, unknown>) => {
    setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n)))
  }

  const prompt = (dialog.prompt as string) ?? ''
  const model = (dialog.model as string) ?? (kind === 'image' ? IMAGE_MODELS[0].id : kind === 'video' ? VIDEO_MODELS[0].id : kind === 'audio' ? AUDIO_MODELS[0].id : TEXT_MODELS[0].id)
  const ratio = (dialog.ratio as string) ?? 'auto'
  const quality = (dialog.quality as string) ?? QUALITY_PRESETS[0]
  const count = (dialog.count as number) ?? 1
  const duration = (dialog.duration as number) ?? VIDEO_DURATIONS[0]
  const preset = (dialog.preset as string) ?? AIGC_IMAGE_PRESETS[0].key

  const modelOptions = useMemo(() => {
    if (kind === 'image') return IMAGE_MODELS
    if (kind === 'video') return VIDEO_MODELS
    if (kind === 'audio') return AUDIO_MODELS
    return TEXT_MODELS
  }, [kind])

  const submit = () => {
    const state = { ...dialog, prompt, model, ratio, quality, count, duration, preset }
    if (kind === 'image') {
      if (preset === 'shot_script') {
        runShotScriptPreset()
        return
      }
      void runImage()
    } else {
      onSubmit(state)
    }
  }

  const runShotScriptPreset = () => {
    if (!prompt.trim()) {
      message.warning('请输入剧本自动生成分镜脚本')
      return
    }
    const rows = rowsFromScript(prompt)
    setNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              type: 'script_breakdown',
              data: {
                ...n.data,
                kind: 'script_breakdown',
                title: '分镜脚本生成',
                status: 'ready',
                script_text: prompt,
                rows,
                analysis: analyzeScriptLocally(prompt),
                dialog: { prompt },
              },
              width: nodeWidthOf('script_breakdown'),
            }
          : n,
      ),
    )
    spendCredits(2)
    message.success('已生成表格式分镜脚本，可继续提取 @实体')
  }

  /** 图片节点真实出图：收集上游素材/图片节点的 file_id 作参照，调用 Seedream。 */
  const runImage = async () => {
    if (!prompt.trim()) {
      message.warning('请先填写提示词')
      return
    }
    if (!project) {
      message.error('缺少项目上下文，无法生成')
      return
    }
    const modelReady = IMAGE_MODELS.find((m) => m.id === model)?.ready
    if (!modelReady) {
      message.info('该图像模型待接入 key，暂不可用；请选择 Seedream。')
      return
    }
    const upstreamNodes = upstreamOf(nodeId)
    const intelligence = finalAssetPrompt({
      kind: 'image',
      userPrompt: prompt,
      analysis: analysisFromUpstream(upstreamNodes),
      preset,
    })
    const refFileIds = upstreamNodes
      .map((n) => (n.data as { file_id?: string }).file_id)
      .filter((x): x is string => !!x)

    patchNode({ status: 'loading', error: undefined, cinematic_plan: intelligence.plan, final_prompt: intelligence.prompt })
    const res = await generateImageFromPrompt({ projectId: project.id, prompt: intelligence.prompt, name: (node?.data as { title?: string })?.title, refFileIds })
    if (res.error) {
      patchNode({ status: 'error', error: res.error })
      message.error(res.error)
    } else {
      patchNode({ status: 'ready', url: res.url, file_id: res.fileId })
      spendCredits(20)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === '/' && prompt.length === 0) setRefMenuOpen(true)
    if (e.key === '@') setNodeRefMenuOpen(true)
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  }

  const insertNodeRef = (insertion: string) => {
    const ta = taRef.current
    const text = `${insertion} `
    if (ta && document.activeElement === ta) {
      const start = ta.selectionStart ?? prompt.length
      const end = ta.selectionEnd ?? prompt.length
      patchDialog({ prompt: prompt.slice(0, start) + text + prompt.slice(end) })
    } else {
      patchDialog({ prompt: prompt + text })
    }
    setNodeRefMenuOpen(false)
    ta?.focus()
  }

  /** 可被 @ 引用的节点：便签引用其正文内容（§8.1），其它节点引用标题作为上游素材标记。 */
  const referenceableNodes = nodes.filter((n) => {
    if (n.id === nodeId) return false
    const nd = n.data as { title?: string; text?: string }
    return n.type === 'sticky' ? !!nd.text : !!nd.title
  })
  const refLabel = (n: (typeof nodes)[number]) => {
    const nd = n.data as { title?: string; text?: string }
    return n.type === 'sticky' ? `便签：${(nd.text ?? '').slice(0, 18)}` : nd.title!
  }
  const refInsertText = (n: (typeof nodes)[number]) => {
    const nd = n.data as { title?: string; text?: string }
    return n.type === 'sticky' ? (nd.text ?? '') : `@${nd.title}`
  }

  return (
    <div className="nw-dock">
      <div className="nw-dock-head">
        <span className="nw-dock-label">
          {kind === 'text' ? '文本生成' : kind === 'image' ? '图片生成' : kind === 'video' ? '视频生成' : '音频生成'}
        </span>
        <div className="nw-dock-head-right">
          {/* §3 积分：真实余额，点击开充值页 */}
          <button className="nw-dock-credits" onClick={() => setRechargeOpen(true)} title="点击充值">
            积分 {credits}
          </button>
          <Tooltip title="全屏编辑提示词">
            <button className="nw-icon-btn" onClick={() => setFullscreen(nodeId)}>
              <ExpandOutlined />
            </button>
          </Tooltip>
        </div>
      </div>

      {kind === 'image' && (
        <div className="nw-dock-row">
          <span className="nw-dock-row-label">快捷生成</span>
          <Select
            size="small"
            value={preset}
            style={{ width: 180 }}
            onChange={(v) => patchDialog({ preset: v })}
            options={AIGC_IMAGE_PRESETS.map((p) => ({ value: p.key, label: p.label }))}
          />
        </div>
      )}

      <textarea
        ref={taRef}
        className="nw-dock-textarea"
        placeholder={kind === 'audio' ? '输入台词以及人物描述' : PLACEHOLDER}
        value={prompt}
        onChange={(e) => patchDialog({ prompt: e.target.value })}
        onKeyDown={handleKeyDown}
      />
      {refMenuOpen && (
        <div className="nw-dock-ref-hint">
          / 引用提示词：从 Recipes 中选择已保存模板（继续输入即可按名称匹配）
          <button className="nw-icon-btn" onClick={() => setRefMenuOpen(false)}>
            ×
          </button>
        </div>
      )}
      {nodeRefMenuOpen && (
        <div className="nw-dock-noderef-menu">
          <div className="nw-dock-noderef-title">@ 引用画布上的节点</div>
          {referenceableNodes.length === 0 ? (
            <div className="nw-dock-noderef-empty">画布上还没有可引用的节点 / 便签</div>
          ) : (
            referenceableNodes.slice(0, 8).map((n) => (
              <div key={n.id} className="nw-dock-noderef-item" onClick={() => insertNodeRef(refInsertText(n))}>
                {refLabel(n)}
              </div>
            ))
          )}
          <button className="nw-icon-btn" onClick={() => setNodeRefMenuOpen(false)}>
            ×
          </button>
        </div>
      )}

      <div className="nw-dock-controls">
        <Select size="small" value={model} style={{ width: 190 }} onChange={(v) => patchDialog({ model: v })}>
          {modelOptions.map((m) => (
            <Select.Option key={m.id} value={m.id} disabled={!m.ready}>
              {m.label}
              {!m.ready ? '（待接入）' : ''}
            </Select.Option>
          ))}
        </Select>

        {(kind === 'image' || kind === 'video') && (
          <Select size="small" value={quality} style={{ width: 96 }} onChange={(v) => patchDialog({ quality: v })}>
            {QUALITY_PRESETS.map((q) => (
              <Select.Option key={q} value={q}>
                {q}
              </Select.Option>
            ))}
          </Select>
        )}

        {(kind === 'image' || kind === 'video') && (
          <Select size="small" value={ratio} style={{ width: 116 }} onChange={(v) => patchDialog({ ratio: v })} optionLabelProp="label">
            {(kind === 'video' ? (['16:9', '9:16'] as const) : ASPECT_RATIOS).map((r) => (
              <Select.Option key={r} value={r} label={<span><RatioIcon ratio={r} /> {r}</span>}>
                <RatioIcon ratio={r} /> {r}
              </Select.Option>
            ))}
          </Select>
        )}

        {/* §9.2 生成数量选择框加宽，文字与选项完整显示 */}
        {(kind === 'image' || kind === 'audio') && (
          <Select size="small" value={count} style={{ width: 138 }} onChange={(v) => patchDialog({ count: v })}>
            {GEN_COUNTS.map((c) => (
              <Select.Option key={c} value={c}>
                生成数量 {c}x
              </Select.Option>
            ))}
          </Select>
        )}

        {/* §9.1 视频时长 5/10/15 秒；框加宽 */}
        {kind === 'video' && (
          <Select size="small" value={duration} style={{ width: 110 }} onChange={(v) => patchDialog({ duration: v })}>
            {VIDEO_DURATIONS.map((d) => (
              <Select.Option key={d} value={d}>
                时长 {d}秒
              </Select.Option>
            ))}
          </Select>
        )}

        <button className="nw-btn nw-dock-submit" onClick={submit}>
          <SendOutlined /> 生成
        </button>
      </div>

      <FullscreenPromptEditor nodeId={nodeId} prompt={prompt} onChange={(v) => patchDialog({ prompt: v })} />
    </div>
  )
}

function FullscreenPromptEditor({ nodeId, prompt, onChange }: { nodeId: string; prompt: string; onChange: (v: string) => void }) {
  const fullscreenId = useUiStore((s) => s.fullscreenPromptNodeId)
  const setFullscreen = useUiStore((s) => s.setFullscreenPromptNodeId)
  const open = fullscreenId === nodeId
  return (
    <Modal open={open} onCancel={() => setFullscreen(null)} onOk={() => setFullscreen(null)} okText="完成" width={760} title="编辑提示词">
      <textarea className="nw-fullscreen-textarea" value={prompt} onChange={(e) => onChange(e.target.value)} autoFocus />
    </Modal>
  )
}
