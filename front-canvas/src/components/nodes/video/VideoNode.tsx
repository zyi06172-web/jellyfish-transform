import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { VideoCameraOutlined } from '@ant-design/icons'
import { NodeChrome, useIsCompactZoom } from '../NodeChrome'
import { useUiStore } from '../../../state/uiStore'
import { nodeWidthOf } from '../../../pages/Canvas/hooks/useNodeOperations'
import type { BaseNodeData } from '../../../types/canvas'
import '../genericNodes.css'

/** 通用视频节点（计划书 §13）：自由创作场景的标准生成节点。
 *  短剧 workflow 里请用 video_shot（连着 shotlist_render 的那个），因为它才会自动
 *  复用同一份关键帧（原则3）；这个通用节点如果没有上游关键帧/镜头输入，同样没有
 *  可调用的后端接口，只给出清楚提示，不冒充能直接出片。 */
function VideoNodeInner({ id, data, selected }: NodeProps) {
  const d = data as unknown as BaseNodeData & { url?: string }
  const compact = useIsCompactZoom()
  const setActiveDialog = useUiStore((s) => s.setActiveDialogNodeId)
  const activeDialogNodeId = useUiStore((s) => s.activeDialogNodeId)

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
        {d.url ? (
          <video src={d.url} controls className="nw-video-preview" />
        ) : (
          <div className="nw-node-empty">
            <VideoCameraOutlined style={{ fontSize: 32 }} />
            <span>点击设置生成参数</span>
          </div>
        )}
      </NodeChrome>
    </div>
  )
}

export const VideoNode = memo(VideoNodeInner)
