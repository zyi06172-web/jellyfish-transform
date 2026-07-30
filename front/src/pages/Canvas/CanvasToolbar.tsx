import { ApiOutlined, DownloadOutlined, FullscreenOutlined, ReloadOutlined } from '@ant-design/icons'
import { Button, Tag } from 'antd'

/** CanvasToolbar 承载画布顶栏命令，避免 ReactFlow 容器堆积展示代码。 */
export function CanvasToolbar({
  modelReady,
  modelLabels,
  onFitView,
  onRefresh,
  onPreviewShotlist,
  onConfirmKeyframes,
  onBuildRenderedShotlist,
  onConfirmVideo,
}: {
  modelReady: boolean
  modelLabels: string[]
  onFitView: () => void
  onRefresh: () => void
  onPreviewShotlist: () => void
  onConfirmKeyframes: () => void
  onBuildRenderedShotlist: () => void
  onConfirmVideo: () => void
}) {
  const cls = 'pointer-events-auto !border-white/12 !bg-black !text-white'
  return (
    <div className="pointer-events-none absolute left-6 top-5 z-10 flex items-center gap-2">
      <Button className={cls} icon={<FullscreenOutlined />} onClick={onFitView}>全览</Button>
      <Button className={cls} icon={<ReloadOutlined />} onClick={onRefresh}>刷新数据</Button>
      <Tag className="pointer-events-auto !m-0 !border-white/12 !bg-black !px-3 !py-1 !text-white/72">
        模型 {modelReady ? '已绑定' : '待配置'} · {modelLabels.join(' / ')}
      </Tag>
      <Button className={cls} icon={<ApiOutlined />}>资产库</Button>
      <Button className={cls} icon={<DownloadOutlined />}>打包下载视频</Button>
      <Button className={cls} onClick={onPreviewShotlist}>预览文字分镜表</Button>
      <Button className={cls} onClick={onConfirmKeyframes}>确认渲染关键帧</Button>
      <Button className={cls} onClick={onBuildRenderedShotlist}>生成渲染分镜表</Button>
      <Button className={cls} onClick={onConfirmVideo}>确认出视频</Button>
    </div>
  )
}
