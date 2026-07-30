import { CheckOutlined, DownloadOutlined } from '@ant-design/icons'
import type { NodeProps } from '@xyflow/react'
import { memo } from 'react'
import { Button } from 'antd'
import { NODE_WIDTH, type ShotlistRenderNodeData } from '../../../pages/Canvas/types'
import { NodeLayout } from '../NodeLayout'
import { NodeEmptyState } from '../NodeStates'

/** ShotlistRenderNode 只引用关键帧同源图片，前端源码排版为审片表。 */
function ShotlistRenderNodeBase({ id, data, selected }: NodeProps) {
  const nodeData = data as ShotlistRenderNodeData
  const rows = nodeData.rows ?? []

  return (
    <NodeLayout
      id={id}
      type="shotlist_render"
      title={nodeData.title || '分镜表（渲染版）· 格 1-5'}
      subtitle="真渲染图 + 真结构化列"
      width={NODE_WIDTH.shotlist_render}
      status={nodeData.status}
      errorMessage={nodeData.error}
      selected={selected}
      handles={{ target: true, source: true }}
      data={nodeData}
      toolbar={[
        { key: 'export', icon: <DownloadOutlined />, tooltip: '导出 PNG', onClick: () => undefined },
        { key: 'video', icon: <CheckOutlined />, tooltip: '确认，开始出视频', onClick: () => undefined },
      ]}
    >
      {rows.length ? (
        <div className="nuwa-shotlist-table">
          <div className="nuwa-shotlist-head">
            <span>格</span><span>渲染图</span><span>拍摄手法</span><span>景别</span><span>情绪</span><span>运动逻辑</span><span>环境氛围</span>
          </div>
          {rows.map((row) => (
            <div key={row.panel_index} className="nuwa-shotlist-row">
              <span>{row.panel_index}</span>
              <span>{row.frame_url ? <img src={row.frame_url} alt={`格 ${row.panel_index}`} /> : '等待'}</span>
              <span>{row.movement}</span>
              <span>{row.camera_shot}</span>
              <span>{row.emotion}</span>
              <span>{(row.action_beats ?? []).join(' → ')}</span>
              <span>{row.atmosphere}</span>
            </div>
          ))}
          <Button size="small" icon={<DownloadOutlined />}>导出 PNG</Button>
        </div>
      ) : (
        <NodeEmptyState label="关键帧完成后，这里引用同一批图片排成渲染版分镜表。" />
      )}
    </NodeLayout>
  )
}

export const ShotlistRenderNode = memo(ShotlistRenderNodeBase)
