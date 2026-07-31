import { useEffect, useState } from 'react'
import { Drawer, Input, Tabs, Empty, Segmented } from 'antd'
import { FilterOutlined } from '@ant-design/icons'
import { useUiStore } from '../../state/uiStore'
import { StudioProjectsService } from '../../services/generated'
import type { ProjectAssetLibraryRead } from '../../services/generated'
import './assetDrawer.css'

/** 资产库 Drawer（计划书 §3）：Tab 顺序 项目资产/素材库/回收站，项目资产接现有
 *  asset-library 接口，不重做资产库后端。素材库/回收站本轮只做空框架（内容交给设计）。 */
export function AssetDrawer({ projectId }: { projectId: string }) {
  const open = useUiStore((s) => s.assetDrawerOpen)
  const toggle = useUiStore((s) => s.toggleAssetDrawer)
  const [lib, setLib] = useState<ProjectAssetLibraryRead | null>(null)
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'large' | 'medium' | 'small'>('medium')

  useEffect(() => {
    if (!open) return
    StudioProjectsService.getProjectAssetLibraryApiV1StudioProjectsProjectIdAssetLibraryGet({ projectId })
      .then((res) => setLib(res.data ?? null))
      .catch(() => setLib(null))
  }, [open, projectId])

  const allItems = [...(lib?.characters ?? []), ...(lib?.scenes ?? []), ...(lib?.props ?? [])].filter((i) =>
    query ? i.name.toLowerCase().includes(query.toLowerCase()) : true,
  )

  return (
    <Drawer title="资产库" placement="left" width={340} open={open} onClose={toggle} className={`nw-asset-drawer view-${view}`}>
      <Tabs
        items={[
          {
            key: 'project',
            label: '项目资产',
            children: (
              <>
                <div className="nw-asset-toolbar">
                  <Input placeholder="按名称或标签搜索" value={query} onChange={(e) => setQuery(e.target.value)} allowClear />
                  <button className="nw-icon-btn" title="筛选：来源(上传/生成)、类型(图片/视频/音频/文本)">
                    <FilterOutlined />
                  </button>
                </div>
                <Segmented
                  size="small"
                  value={view}
                  onChange={(v) => setView(v as typeof view)}
                  options={[
                    { label: '大图标', value: 'large' },
                    { label: '中图标', value: 'medium' },
                    { label: '小图标', value: 'small' },
                  ]}
                  style={{ marginBottom: 10 }}
                />
                {allItems.length === 0 ? (
                  <Empty description="还没有资源" />
                ) : (
                  <div className="nw-asset-grid">
                    {allItems.map((item) => (
                      <div key={item.id} className="nw-asset-card">
                        {item.reference_images?.[0] ? (
                          <img src={item.reference_images[0].url} className="nw-asset-thumb" />
                        ) : (
                          <div className="nw-asset-thumb nw-asset-thumb-empty" />
                        )}
                        <div className="nw-asset-name">{item.name}</div>
                        <div className="nw-asset-type">{item.type}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ),
          },
          {
            key: 'material',
            label: '素材库',
            children: <Empty description="素材库：跨项目复用资产的卡片墙（内容交给设计，本轮仅占位）" />,
          },
          {
            key: 'trash',
            label: '回收站',
            children: <Empty description="回收站：软删除资产，可还原/彻底删除（内容交给设计，本轮仅占位）" />,
          },
        ]}
      />
    </Drawer>
  )
}
