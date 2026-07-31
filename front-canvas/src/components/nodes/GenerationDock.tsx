import { useMemo, useRef, useState } from 'react'
import { Modal, Select, Tooltip } from 'antd'
import { useCanvasFlow } from '../../pages/Canvas/CanvasFlowContext'
import { ExpandOutlined, SendOutlined } from '@ant-design/icons'
import { useUiStore } from '../../state/uiStore'
import {
  ASPECT_RATIOS,
  AUDIO_MODELS,
  GEN_COUNTS,
  IMAGE_MODELS,
  QUALITY_PRESETS,
  TEXT_MODELS,
  VIDEO_DURATIONS,
  VIDEO_MODELS,
  type NodeKind,
} from '../../types/canvas'
import { CANVAS_TYPE_CONFIGS } from '../../types/canvasTypeConfig'
import { RatioIcon } from './RatioIcon'
import './generationDock.css'

interface GenerationDockProps {
  nodeId: string
  kind: Extract<NodeKind, 'text' | 'image' | 'video' | 'audio'>
  onSubmit: (dialogState: Record<string, unknown>) => void
}

const PLACEHOLDER = '输入描述（Enter 换行，Ctrl/⌘+Enter 提交，/ 引用提示词，@ 引用节点）'

/** 贴底大对话框：点节点出、切节点保留态 —— 数据存在该节点自己的 data.dialog 里（受控组件） */
export function GenerationDock({ nodeId, kind, onSubmit }: GenerationDockProps) {
  const { nodes, setNodes } = useCanvasFlow()
  const node = nodes.find((n) => n.id === nodeId)
  const canvasType = useUiStore((s) => s.canvasType)
  const setFullscreen = useUiStore((s) => s.setFullscreenPromptNodeId)
  const config = CANVAS_TYPE_CONFIGS[canvasType]
  const [refMenuOpen, setRefMenuOpen] = useState(false)
  const [nodeRefMenuOpen, setNodeRefMenuOpen] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)

  const dialog = (node?.data?.dialog as Record<string, unknown>) ?? {}

  const patchDialog = (patch: Record<string, unknown>) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, dialog: { ...(n.data.dialog as object), ...patch } } } : n)),
    )
  }

  const prompt = (dialog.prompt as string) ?? ''
  const model = (dialog.model as string) ?? (kind === 'image' ? IMAGE_MODELS[0].id : kind === 'video' ? VIDEO_MODELS[0].id : kind === 'audio' ? AUDIO_MODELS[0].id : TEXT_MODELS[0].id)
  const ratio = (dialog.ratio as string) ?? 'auto'
  const quality = (dialog.quality as string) ?? QUALITY_PRESETS[0]
  const count = (dialog.count as number) ?? 1
  const duration = (dialog.duration as number) ?? VIDEO_DURATIONS[0]
  const preset = (dialog.preset as string) ?? config.imagePresets[0]?.key

  const modelOptions = useMemo(() => {
    if (kind === 'image') return IMAGE_MODELS
    if (kind === 'video') return VIDEO_MODELS
    if (kind === 'audio') return AUDIO_MODELS
    return TEXT_MODELS
  }, [kind])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === '/' && prompt.length === 0) {
      setRefMenuOpen(true)
    }
    if (e.key === '@') {
      setNodeRefMenuOpen(true)
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      onSubmit({ ...dialog, prompt, model, ratio, quality, count, duration, preset })
    }
  }

  /** @ 引用节点：把选中节点的标题插入到当前光标处，作为上游素材引用文本 */
  const insertNodeRef = (refTitle: string) => {
    const ta = taRef.current
    const insertion = `@${refTitle} `
    if (ta && document.activeElement === ta) {
      const start = ta.selectionStart ?? prompt.length
      const end = ta.selectionEnd ?? prompt.length
      patchDialog({ prompt: prompt.slice(0, start) + insertion + prompt.slice(end) })
    } else {
      patchDialog({ prompt: prompt + insertion })
    }
    setNodeRefMenuOpen(false)
    ta?.focus()
  }

  const referenceableNodes = nodes.filter((n) => n.id !== nodeId && (n.data as { title?: string })?.title)

  return (
    <div className="nw-dock">
      <div className="nw-dock-head">
        <span className="nw-dock-label">
          {kind === 'text' ? '文本生成' : kind === 'image' ? '图片生成' : kind === 'video' ? '视频生成' : '音频生成'}
        </span>
        <div className="nw-dock-head-right">
          <span className="nw-dock-credits">积分 {320}</span>
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
            options={config.imagePresets.map((p) => ({ value: p.key, label: p.label }))}
          />
        </div>
      )}

      {kind === 'audio' ? (
        <textarea
          ref={taRef}
          className="nw-dock-textarea"
          placeholder="输入台词以及人物描述"
          value={prompt}
          onChange={(e) => patchDialog({ prompt: e.target.value })}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <textarea
          ref={taRef}
          className="nw-dock-textarea"
          placeholder={PLACEHOLDER}
          value={prompt}
          onChange={(e) => patchDialog({ prompt: e.target.value })}
          onKeyDown={handleKeyDown}
        />
      )}
      {refMenuOpen && (
        <div className="nw-dock-ref-hint">
          / 引用提示词功能：从设置里的 Recipes 中选择已保存模板（先关闭本提示，继续输入即可按名称匹配）
          <button className="nw-icon-btn" onClick={() => setRefMenuOpen(false)}>
            ×
          </button>
        </div>
      )}
      {nodeRefMenuOpen && (
        <div className="nw-dock-noderef-menu">
          <div className="nw-dock-noderef-title">@ 引用画布上的节点</div>
          {referenceableNodes.length === 0 ? (
            <div className="nw-dock-noderef-empty">画布上还没有其它带标题的节点</div>
          ) : (
            referenceableNodes.slice(0, 8).map((n) => (
              <div key={n.id} className="nw-dock-noderef-item" onClick={() => insertNodeRef((n.data as { title?: string }).title!)}>
                {(n.data as { title?: string }).title}
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
          <Select
            size="small"
            value={ratio}
            style={{ width: 110 }}
            onChange={(v) => patchDialog({ ratio: v })}
            optionLabelProp="label"
          >
            {(kind === 'video' ? (['16:9', '9:16'] as const) : ASPECT_RATIOS).map((r) => (
              <Select.Option key={r} value={r} label={<span><RatioIcon ratio={r} /> {r}</span>}>
                <RatioIcon ratio={r} /> {r}
              </Select.Option>
            ))}
          </Select>
        )}

        {kind === 'image' && (
          <Select size="small" value={count} style={{ width: 84 }} onChange={(v) => patchDialog({ count: v })}>
            {GEN_COUNTS.map((c) => (
              <Select.Option key={c} value={c}>
                生成数量 {c}x
              </Select.Option>
            ))}
          </Select>
        )}

        {kind === 'video' && (
          <Select size="small" value={duration} style={{ width: 96 }} onChange={(v) => patchDialog({ duration: v })}>
            {VIDEO_DURATIONS.map((d) => (
              <Select.Option key={d} value={d}>
                {d}秒
              </Select.Option>
            ))}
          </Select>
        )}

        {kind === 'audio' && (
          <Select size="small" value={count} style={{ width: 84 }} onChange={(v) => patchDialog({ count: v })}>
            {GEN_COUNTS.map((c) => (
              <Select.Option key={c} value={c}>
                生成数量 {c}x
              </Select.Option>
            ))}
          </Select>
        )}

        <button
          className="nw-btn nw-dock-submit"
          onClick={() => onSubmit({ ...dialog, prompt, model, ratio, quality, count, duration, preset })}
        >
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
    <Modal
      open={open}
      onCancel={() => setFullscreen(null)}
      onOk={() => setFullscreen(null)}
      okText="完成"
      width={760}
      title="编辑提示词"
    >
      <textarea className="nw-fullscreen-textarea" value={prompt} onChange={(e) => onChange(e.target.value)} autoFocus />
    </Modal>
  )
}
