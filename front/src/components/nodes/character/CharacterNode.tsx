import { DownloadOutlined, ReloadOutlined, SwapOutlined } from '@ant-design/icons'
import type { NodeProps } from '@xyflow/react'
import { memo } from 'react'
import { Tag } from 'antd'
import { NODE_WIDTH, type CharacterNodeData } from '../../../pages/Canvas/types'
import { NodeLayout } from '../NodeLayout'
import { NodeEmptyState } from '../NodeStates'

function accessoryText(bible?: Record<string, unknown>) {
  const rawAccessories = bible?.wearable_accessories
  const items: unknown[] = Array.isArray(rawAccessories) ? rawAccessories : []
  return items
    .map((item) => {
      const row = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      return [row.name, row.placement].filter(Boolean).join(' @ ')
    })
    .filter(Boolean)
    .join('；')
}

/** CharacterNode 展示角色四视图，固定为左大脸与右侧三张全身视图。 */
function CharacterNodeBase({ id, data, selected }: NodeProps) {
  const nodeData = data as CharacterNodeData
  const images = nodeData.images ?? {}
  const accessory = accessoryText(nodeData.bible_json)

  return (
    <NodeLayout
      id={id}
      type="character"
      title={`角色资产 · ${nodeData.name || '未命名角色'}`}
      subtitle={nodeData.linked_existing ? '复用自资产库' : '四视图 · 纯白底'}
      width={NODE_WIDTH.character}
      status={nodeData.status}
      errorMessage={nodeData.error}
      selected={selected}
      cost={nodeData.linked_existing ? undefined : nodeData.cost}
      handles={{ target: true, source: true }}
      data={nodeData}
      toolbar={[
        { key: 'rerender', icon: <ReloadOutlined />, tooltip: '重渲为新节点', onClick: () => undefined },
        { key: 'swap', icon: <SwapOutlined />, tooltip: '从资产库替换', onClick: () => undefined },
        { key: 'download', icon: <DownloadOutlined />, tooltip: '下载四视图', onClick: () => undefined },
      ]}
    >
      <div className="space-y-3">
        {nodeData.linked_existing ? <Tag className="mr-0">复用自资产库</Tag> : null}
        <div className="nuwa-character-views">
          <ImageSlot label="左脸特写" url={images.face_closeup} large />
          <div className="grid grid-cols-3 gap-2">
            <ImageSlot label="全身正" url={images.full_front} />
            <ImageSlot label="全身侧" url={images.full_side} />
            <ImageSlot label="全身背" url={images.full_back} />
          </div>
        </div>
        {accessory ? <div className="text-xs text-white/64">{accessory}</div> : null}
        <div className="nuwa-node-text-block">
          {String(nodeData.bible_json?.identity || nodeData.bible_json?.temperament || '角色圣经等待生成。')}
        </div>
      </div>
    </NodeLayout>
  )
}

function ImageSlot({ label, url, large }: { label: string; url?: string; large?: boolean }) {
  return (
    <div className={large ? 'nuwa-image-slot-large' : 'nuwa-image-slot'} style={{ aspectRatio: large ? '1 / 1' : '2 / 3' }}>
      {url ? <img src={url} alt={label} /> : <NodeEmptyState label="补渲这一张" />}
      <span>{label}</span>
    </div>
  )
}

export const CharacterNode = memo(CharacterNodeBase)
