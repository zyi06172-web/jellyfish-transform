import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { UserOutlined } from '@ant-design/icons'
import { NodeChrome, useIsCompactZoom } from '../NodeChrome'
import { nodeWidthOf } from '../../../pages/Canvas/hooks/useNodeOperations'
import { useUiStore } from '../../../state/uiStore'
import '../genericNodes.css'
import './characterNode.css'

interface RefImage {
  image_id: number
  file_id: string
  url: string
  view_angle: string
  quality_level: string
  is_primary?: boolean
}

interface CharacterData {
  name?: string
  bible_json?: Record<string, unknown>
  reference_images?: RefImage[]
  linked_existing?: boolean
}

const ANGLE_LABEL: Record<string, string> = { front: '全身正', left: '左侧特写', right: '全身侧', back: '全身背' }

/** N2 角色资产节点（业务附件 §6 N2）：左大 + 右三横排，纯白底，四视图不 slice。
 *  说明：后端默认视角为 正/左/右/背（entity_specs.DEFAULT_VIEW_ANGLES），不是专门的
 *  "脸部特写"机位；这里把左视角放大展示以贴近产品要的"一大三小"布局，标签仍如实标注
 *  真实 view_angle，不虚构"脸特写"字样。 */
function CharacterNodeInner({ id, data, selected }: NodeProps) {
  const d = data as unknown as CharacterData
  const compact = useIsCompactZoom()
  const toggleChat = useUiStore((s) => s.toggleChatPanel)
  const chatOpen = useUiStore((s) => s.chatPanelOpen)
  const images = d.reference_images ?? []
  const large = images.find((i) => i.view_angle === 'left') ?? images[0]
  const smalls = images.filter((i) => i.image_id !== large?.image_id)

  const bible = d.bible_json ?? {}
  const wearable = (bible.wearable_accessories as Array<{ name?: string; placement?: string }>) ?? []
  const bibleText =
    (bible.appearance_summary as string) || (bible.summary as string) || (typeof bible === 'object' ? Object.values(bible).find((v) => typeof v === 'string') as string : '') || ''

  return (
    <NodeChrome
      id={id}
      typeLabel="角色资产"
      title={`角色资产 · ${d.name ?? ''}`}
      subtitle={d.linked_existing ? '复用自资产库' : images.length ? '已入库' : undefined}
      width={nodeWidthOf('character')}
      status={images.length ? 'ready' : 'loading'}
      selected={selected}
      compact={compact}
      data={d}
      costText={d.linked_existing ? undefined : undefined}
    >
      {images.length ? (
        <>
          <div className="nw-char-grid">
            <div className="nw-char-large">
              {large && <img src={large.url} className="nw-media-thumb" style={{ aspectRatio: '3/4', height: '100%' }} />}
              <span className="nw-char-tag">{large ? ANGLE_LABEL[large.view_angle] ?? large.view_angle : ''}</span>
            </div>
            <div className="nw-char-smalls">
              {smalls.map((img) => (
                <div key={img.image_id} className="nw-char-small">
                  <img src={img.url} className="nw-media-thumb" style={{ aspectRatio: '3/4' }} />
                  <span className="nw-char-tag">{ANGLE_LABEL[img.view_angle] ?? img.view_angle}</span>
                </div>
              ))}
              {smalls.length < 3 &&
                Array.from({ length: 3 - smalls.length }).map((_, i) => (
                  <div key={`empty_${i}`} className="nw-char-small nw-char-empty">
                    补渲这一张
                  </div>
                ))}
            </div>
          </div>
          {wearable.length > 0 && (
            <div className="nw-char-accessory">纯白底 · {wearable.map((w) => `${w.name ?? ''}（${w.placement ?? '穿戴于人物身上'}）`).join('、')}</div>
          )}
          {bibleText && (
            <>
              <div className="nw-script-divider">角色圣经</div>
              <div className="nw-char-bible">{bibleText}</div>
            </>
          )}
        </>
      ) : (
        <div className="nw-node-empty">
          <UserOutlined style={{ fontSize: 32 }} />
          <span>等待 agent 对话生成四视图…</span>
          <button className="nw-btn nw-btn-secondary" onClick={() => !chatOpen && toggleChat()}>
            去对话框查看进度
          </button>
        </div>
      )}
    </NodeChrome>
  )
}

export const CharacterNode = memo(CharacterNodeInner)
