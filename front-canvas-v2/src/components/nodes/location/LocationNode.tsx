import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { EnvironmentOutlined } from '@ant-design/icons'
import { NodeChrome, useIsCompactZoom } from '../NodeChrome'
import { nodeWidthOf } from '../../../pages/Canvas/hooks/useNodeOperations'
import { AssetQuickGenerate } from '../AssetQuickGenerate'
import '../genericNodes.css'

interface RefImage {
  image_id: number
  url: string
  view_angle: string
}
interface LocationData {
  name?: string
  reference_images?: RefImage[]
  aspect_ratio?: string
  extracted_description?: string
}

/** N3 场景资产节点（业务附件 §6 N3）。比例读项目设置，不硬编码 9:16。 */
function LocationNodeInner({ id, data, selected }: NodeProps) {
  const d = data as unknown as LocationData
  const compact = useIsCompactZoom()
  const cover = d.reference_images?.[0]
  const ratio = d.aspect_ratio || '16:9'

  return (
    <NodeChrome
      id={id}
      typeLabel="场景资产"
      title={`场景 · ${d.name ?? ''}`}
      width={nodeWidthOf('location')}
      status={cover ? 'ready' : d.extracted_description ? 'empty' : 'loading'}
      selected={selected}
      compact={compact}
      data={d}
    >
      {cover ? (
        <img src={cover.url} className="nw-media-thumb" style={{ aspectRatio: ratio.replace(':', ' / '), width: '100%' }} />
      ) : (
        <div className="nw-node-empty">
          {d.extracted_description ? (
            <AssetQuickGenerate nodeId={id} kind="location" name={d.name} description={d.extracted_description} />
          ) : (
            <>
              <EnvironmentOutlined style={{ fontSize: 28 }} />
              <span>等待 agent 对话生成场景图…</span>
            </>
          )}
        </div>
      )}
      <div className="nw-script-row" style={{ marginTop: 8 }}>
        <span>画幅比例</span>
        <span>{ratio}</span>
      </div>
    </NodeChrome>
  )
}

export const LocationNode = memo(LocationNodeInner)
