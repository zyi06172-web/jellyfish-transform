import { useState } from 'react'
import { ArrowUpOutlined } from '@ant-design/icons'
import { message } from 'antd'
import { useCanvasFlow } from '../../pages/Canvas/CanvasFlowContext'
import { useProjectSettings } from '../../state/projectContext'
import { useUpstream } from '../../pages/Canvas/hooks/useUpstream'
import { generateImageFromPrompt } from '../../services/imageGen'
import { analysisFromUpstream, finalAssetPrompt, type ExtractedEntityKind } from '../../services/promptIntelligence'
import './assetQuickGenerate.css'

interface AssetQuickGenerateProps {
  nodeId: string
  kind: ExtractedEntityKind
  name?: string
  description?: string
}

/** 自动提取资产节点的生成入口：描述可补充，箭头一键生成并走动态摄影 prompt 合并。 */
export function AssetQuickGenerate({ nodeId, kind, name, description }: AssetQuickGenerateProps) {
  const { project } = useProjectSettings()
  const { setNodes } = useCanvasFlow()
  const { upstreamOf } = useUpstream()
  const [extra, setExtra] = useState('')

  const patchNode = (patch: Record<string, unknown>) => {
    setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, data: { ...node.data, ...patch } } : node)))
  }

  const run = async () => {
    if (!project) {
      message.error('缺少项目上下文，无法生成')
      return
    }
    const userPrompt = [description, extra].filter(Boolean).join('\n')
    const upstream = upstreamOf(nodeId)
    const intelligence = finalAssetPrompt({
      kind,
      entityName: name,
      userPrompt,
      analysis: analysisFromUpstream(upstream),
    })
    patchNode({ status: 'loading', error: undefined, cinematic_plan: intelligence.plan, final_prompt: intelligence.prompt })
    const res = await generateImageFromPrompt({ projectId: project.id, prompt: intelligence.prompt, name })
    if (res.error) {
      patchNode({ status: 'error', error: res.error })
      message.error(res.error)
      return
    }
    patchNode({
      status: 'ready',
      file_id: res.fileId,
      reference_images: [{ image_id: Date.now(), file_id: res.fileId, url: res.url, view_angle: 'composite', quality_level: 'generated', is_primary: true }],
    })
    message.success('资产合图已生成')
  }

  return (
    <div className="nw-asset-quick">
      <button className="nw-asset-arrow" title="直接用提取描述生成" onClick={run}>
        <ArrowUpOutlined />
      </button>
      <div className="nw-asset-desc">{description || '从分镜脚本提取出的描述会显示在这里'}</div>
      <textarea
        value={extra}
        onChange={(event) => setExtra(event.target.value)}
        placeholder="可补充描述，用户描述优先"
      />
    </div>
  )
}
