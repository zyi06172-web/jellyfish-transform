import { memo, useRef, useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import { UploadOutlined, ShoppingOutlined } from '@ant-design/icons'
import { message } from 'antd'
import { NodeChrome, useIsCompactZoom } from '../NodeChrome'
import { useCanvasFlow } from '../../../pages/Canvas/CanvasFlowContext'
import { nodeWidthOf } from '../../../pages/Canvas/hooks/useNodeOperations'
import { createProductProp, generateProductHero, generateProductMultiAngle, uploadReferenceImage } from '../../../services/ecommerceRuntime'
import { useProjectSettings } from '../../../state/projectContext'
import '../genericNodes.css'
import './productNode.css'

interface ProductData {
  name?: string
  description?: string
  refFileId?: string
  refUrl?: string
  propId?: string
  heroUrl?: string
  angleUrls?: Record<string, string>
  stage?: 'draft' | 'uploading' | 'hero_loading' | 'hero_ready' | 'angles_loading' | 'angles_ready' | 'error'
  error?: string
}

/** 电商画布 · 商品节点：上传商品原图 → 产品设定图（白底）→ 多角度扩展。
 *  复用后端"道具(prop)"资产的图片槽位真实生成（见 services/ecommerceRuntime.ts 顶部注释）。
 *  场景合成/详情页排版/营销海报本轮仍是占位，走通用图片节点的电商预设展示，
 *  不在本节点里假装能做。 */
function ProductNodeInner({ id, data, selected }: NodeProps) {
  const d = data as unknown as ProductData
  const compact = useIsCompactZoom()
  const { setNodes } = useCanvasFlow()
  const { project } = useProjectSettings()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(d.name ?? '')
  const [description, setDescription] = useState(d.description ?? '')

  const patch = (p: Partial<ProductData>) => setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...p } } : n)))

  const onPickFile = () => fileInputRef.current?.click()

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !project) return
    patch({ stage: 'uploading' })
    try {
      const uploaded = await uploadReferenceImage(file, project.id)
      patch({ refFileId: uploaded?.id, refUrl: URL.createObjectURL(file), stage: 'draft' })
    } catch {
      patch({ stage: 'error', error: '上传失败，请检查后端 /studio/files/upload 是否可用' })
    }
  }

  const generateHero = async () => {
    if (!project || !name.trim()) {
      message.warning('先填写商品名称')
      return
    }
    patch({ name, description, stage: 'hero_loading', error: undefined })
    try {
      let propId = d.propId
      if (!propId) {
        propId = await createProductProp(project.id, name, description)
        patch({ propId })
      }
      const result = await generateProductHero(propId, name, description, d.refFileId)
      if (result.error) {
        patch({ stage: 'error', error: result.error })
      } else {
        patch({ stage: 'hero_ready', heroUrl: result.url })
      }
    } catch (err) {
      patch({ stage: 'error', error: err instanceof Error ? err.message : '生成失败' })
    }
  }

  const generateAngles = async () => {
    if (!d.propId) return
    patch({ stage: 'angles_loading' })
    try {
      const results = await generateProductMultiAngle(d.propId, name, description)
      const angleUrls: Record<string, string> = {}
      let firstError: string | undefined
      for (const [angle, r] of Object.entries(results)) {
        if (r.url) angleUrls[angle] = r.url
        if (r.error && !firstError) firstError = r.error
      }
      patch({ stage: firstError ? 'error' : 'angles_ready', angleUrls, error: firstError })
    } catch (err) {
      patch({ stage: 'error', error: err instanceof Error ? err.message : '生成失败' })
    }
  }

  const status = d.stage === 'error' ? 'error' : d.stage === 'hero_loading' || d.stage === 'angles_loading' || d.stage === 'uploading' ? 'loading' : d.heroUrl ? 'ready' : 'empty'

  return (
    <NodeChrome
      id={id}
      typeLabel="商品"
      title={`商品 · ${d.name || '未命名'}`}
      width={nodeWidthOf('product')}
      status={status}
      errorMessage={d.error}
      onRetry={d.heroUrl ? generateAngles : generateHero}
      selected={selected}
      compact={compact}
      data={d}
    >
      <div className="nw-product-form">
        <input placeholder="商品名称（例：陶瓷保温杯）" value={name} onChange={(e) => setName(e.target.value)} />
        <textarea placeholder="商品描述 / 材质卖点" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFileSelected} />
        <button className="nw-btn nw-btn-secondary" onClick={onPickFile}>
          <UploadOutlined /> {d.refUrl ? '已上传原图，点击更换' : '上传商品原图'}
        </button>
        {d.refUrl && <img src={d.refUrl} className="nw-product-ref-thumb" />}
      </div>

      {d.heroUrl ? (
        <div className="nw-product-result">
          <img src={d.heroUrl} className="nw-media-thumb" style={{ aspectRatio: '1/1' }} />
          <div className="nw-product-angles">
            {['left', 'right', 'back'].map((a) =>
              d.angleUrls?.[a] ? (
                <img key={a} src={d.angleUrls[a]} className="nw-media-thumb" />
              ) : (
                <div key={a} className="nw-product-angle-empty">
                  {a}
                </div>
              ),
            )}
          </div>
        </div>
      ) : (
        <div className="nw-node-empty">
          <ShoppingOutlined style={{ fontSize: 28 }} />
          <span>白底产品设定图 + 3 个角度</span>
        </div>
      )}

      <div className="nw-product-actions">
        <button className="nw-btn" onClick={generateHero}>
          生成产品设定图（白底）
        </button>
        {d.heroUrl && (
          <button className="nw-btn nw-btn-secondary" onClick={generateAngles}>
            生成多角度（左/右/背）
          </button>
        )}
      </div>
    </NodeChrome>
  )
}

export const ProductNode = memo(ProductNodeInner)
