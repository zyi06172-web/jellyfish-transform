import { memo, useEffect, useRef, useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import { DownloadOutlined, ReloadOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { Modal } from 'antd'
import { NodeChrome, useIsCompactZoom } from '../NodeChrome'
import { useCanvasFlow } from '../../../pages/Canvas/CanvasFlowContext'
import { nodeWidthOf, useNodeOperations } from '../../../pages/Canvas/hooks/useNodeOperations'
import { fetchVideoResult, generateVideoForShot } from '../../../services/generationRuntime'
import { estimateCost } from '../../../pages/Canvas/hooks/useGenerationCost'
import { useUiStore } from '../../../state/uiStore'
import type { VideoClip } from '../../../types/canvas'
import { VideoEditPanel } from './VideoEditPanel'
import '../genericNodes.css'

interface VideoShotData {
  shot_id?: string
  shot_label?: string
  ratio?: string
  duration?: number
  prompt_used?: string
  url?: string
  taskId?: string
  autoStart?: boolean
  clips?: VideoClip[]
}

/** N9 视频节点（业务附件 §6 N9）：内嵌播放 + 下载为必需功能；"重出"新开节点（原则2）。 */
function VideoShotNodeInner({ id, data, selected }: NodeProps) {
  const d = data as unknown as VideoShotData
  const compact = useIsCompactZoom()
  const { setNodes } = useCanvasFlow()
  const { deriveNode } = useNodeOperations()
  const spendCredits = useUiStore((s) => s.spendCredits)
  const startedRef = useRef(false)
  const [editorOpen, setEditorOpen] = useState(false)

  const patch = (p: Record<string, unknown>) => setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...p } } : n)))

  const run = async () => {
    if (!d.shot_id) return
    patch({ status: 'loading', error: undefined })
    const created = await generateVideoForShot({ shotId: d.shot_id, ratio: d.ratio ?? '16:9', prompt: d.prompt_used })
    if (created.error || !created.taskId) {
      patch({ status: 'error', error: created.error || '未获取到任务 ID' })
      return
    }
    const result = await fetchVideoResult(created.taskId)
    if (result.error) {
      patch({ status: 'error', error: result.error })
    } else {
      patch({ status: 'ready', url: result.url })
      spendCredits(800) // 1 条视频约 800 积分（§7 说明条口径）
    }
  }

  useEffect(() => {
    if (d.autoStart && !startedRef.current) {
      startedRef.current = true
      void run()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.autoStart])

  const regenerate = () => {
    deriveNode(id, 'video_shot', { title: d.shot_label, shot_id: d.shot_id, ratio: d.ratio, autoStart: true, status: 'loading' })
  }

  const showPrompt = () => {
    Modal.info({ title: '提示词（prompt_used）', content: <pre style={{ whiteSpace: 'pre-wrap' }}>{d.prompt_used || '（后端未返回 prompt_used，已在交付说明标注为已知差距）'}</pre> })
  }

  const download = () => {
    if (d.url) window.open(d.url, '_blank')
  }
  const clips = d.clips?.length ? d.clips : d.url ? [{ id, videoUrl: d.url, name: d.shot_label || '镜头视频', duration: d.duration ?? 5, order: 0 }] : []
  const saveClips = (next: VideoClip[]) => {
    patch({ clips: next })
    setEditorOpen(false)
  }

  const status = (data as { status?: string }).status ?? (d.url ? 'ready' : 'loading')

  return (
    <NodeChrome
      id={id}
      typeLabel="视频"
      title={`视频 · ${d.shot_label ?? ''}`}
      width={nodeWidthOf('video_shot')}
      status={status as never}
      errorMessage={(data as { error?: string }).error}
      onRetry={run}
      selected={selected}
      compact={compact}
      data={d}
      handles={{ target: true, source: false }}
      costText={status === 'ready' ? `≈¥${estimateCost('seedance-2.0').toFixed(2)}` : undefined}
      toolbar={[
        { key: 'redo', icon: <ReloadOutlined />, tooltip: '重出（新开节点）', onClick: regenerate },
        { key: 'prompt', icon: <InfoCircleOutlined />, tooltip: '看提示词', onClick: showPrompt },
        { key: 'download', icon: <DownloadOutlined />, tooltip: '下载', onClick: download },
      ]}
    >
      {d.url ? (
        <>
          <div className="nw-video-actions">
            <button className="nw-btn nw-btn-secondary" onClick={() => setEditorOpen(true)}>
              视频编辑
            </button>
          </div>
          <video src={d.url} controls className="nw-video-preview" />
        </>
      ) : (
        <div className="nw-node-empty">{status === 'loading' ? '正在生成视频…' : '等待生成'}</div>
      )}
      <div className="nw-script-row">
        <span>比例</span>
        <span>{d.ratio ?? '16:9'}</span>
      </div>
      <VideoEditPanel open={editorOpen} clips={clips} onClose={() => setEditorOpen(false)} onSave={saveClips} />
    </NodeChrome>
  )
}

export const VideoShotNode = memo(VideoShotNodeInner)
