import { memo, useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import { VideoCameraOutlined } from '@ant-design/icons'
import { NodeChrome, useIsCompactZoom } from '../NodeChrome'
import { useUiStore } from '../../../state/uiStore'
import { nodeWidthOf } from '../../../pages/Canvas/hooks/useNodeOperations'
import type { BaseNodeData } from '../../../types/canvas'
import type { VideoClip } from '../../../types/canvas'
import { useCanvasFlow } from '../../../pages/Canvas/CanvasFlowContext'
import { VideoEditPanel } from './VideoEditPanel'
import '../genericNodes.css'

/** 通用视频节点（计划书 §13）：自由创作场景的标准生成节点。
 *  短剧 workflow 里请用 video_shot（连着 shotlist_render 的那个），因为它才会自动
 *  复用同一份关键帧（原则3）；这个通用节点如果没有上游关键帧/镜头输入，同样没有
 *  可调用的后端接口，只给出清楚提示，不冒充能直接出片。 */
function VideoNodeInner({ id, data, selected }: NodeProps) {
  const d = data as unknown as BaseNodeData & { url?: string; clips?: VideoClip[] }
  const compact = useIsCompactZoom()
  const setActiveDialog = useUiStore((s) => s.setActiveDialogNodeId)
  const activeDialogNodeId = useUiStore((s) => s.activeDialogNodeId)
  const { setNodes } = useCanvasFlow()
  const [editorOpen, setEditorOpen] = useState(false)
  const clips = d.clips?.length ? d.clips : d.url ? [{ id, videoUrl: d.url, name: d.title || '镜头视频', duration: 5, order: 0 }] : []
  const saveClips = (next: VideoClip[]) => {
    setNodes((prev) => prev.map((node) => (node.id === id ? { ...node, data: { ...node.data, clips: next } } : node)))
    setEditorOpen(false)
  }

  return (
    <div onClick={() => setActiveDialog(activeDialogNodeId === id ? null : id)}>
      <NodeChrome
        id={id}
        typeLabel="视频"
        title={d.title || '视频节点'}
        width={nodeWidthOf('video')}
        status={d.status}
        errorMessage={d.error}
        selected={selected}
        compact={compact}
        data={d}
        aboveLabel={`VIDEO · ${id.slice(-4)}`}
      >
        <div className="nw-video-actions">
          <button className="nw-btn nw-btn-secondary" onClick={(event) => { event.stopPropagation(); setEditorOpen(true) }}>
            视频编辑
          </button>
        </div>
        {d.url ? (
          <video src={d.url} controls className="nw-video-preview" />
        ) : (
          <div className="nw-node-empty">
            <VideoCameraOutlined style={{ fontSize: 32 }} />
            <span>点击设置生成参数</span>
          </div>
        )}
        <VideoEditPanel open={editorOpen} clips={clips} onClose={() => setEditorOpen(false)} onSave={saveClips} />
      </NodeChrome>
    </div>
  )
}

export const VideoNode = memo(VideoNodeInner)
