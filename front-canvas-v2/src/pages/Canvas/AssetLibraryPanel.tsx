import { useEffect, useState } from 'react'
import { Input, Tabs, Empty, Segmented, Popover, Checkbox, Modal, message } from 'antd'
import { FilterOutlined, CloseOutlined, ReloadOutlined, DeleteOutlined } from '@ant-design/icons'
import { useUiStore } from '../../state/uiStore'
import { StudioProjectsService } from '../../services/generated'
import type { ProjectAssetLibraryRead, AssetLibraryItemRead } from '../../services/generated'
import './assetLibraryPanel.css'

type ViewSize = 'large' | 'medium' | 'small'
type TypeFilter = 'all' | 'image' | 'video' | 'audio' | 'text'

interface TrashItem {
  id: string
  name: string
  type: string
  url?: string
  deletedAt: number
}

/** §6 资产库面板（照文字描述实现，暗色；设计图未随本轮附到，按文字规格做）：
 *  三 tab（项目资产 / 素材库 / 回收站）+ 搜索 + 筛选漏斗 + 类型筛选 + 三视图切换；
 *  回收站含 hover 还原/彻底删除、清空回收站（二次确认）、空态。
 *  项目资产接现有 asset-library 接口；素材库/回收站后端无对应接口（已在报告列出），
 *  回收站用本地状态演示交互，素材库给空态 + 引导。 */
export function AssetLibraryPanel({ projectId }: { projectId: string }) {
  const open = useUiStore((s) => s.activePanel) === 'assets'
  const setActivePanel = useUiStore((s) => s.setActivePanel)
  const [lib, setLib] = useState<ProjectAssetLibraryRead | null>(null)
  const [query, setQuery] = useState('')
  const [view, setView] = useState<ViewSize>('medium')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [sources, setSources] = useState<string[]>(['upload', 'generated'])
  const [trash, setTrash] = useState<TrashItem[]>([])

  useEffect(() => {
    if (!open) return
    StudioProjectsService.getProjectAssetLibraryApiV1StudioProjectsProjectIdAssetLibraryGet({ projectId })
      .then((res) => setLib(res.data ?? null))
      .catch(() => setLib(null))
  }, [open, projectId])

  const allItems: AssetLibraryItemRead[] = [...(lib?.characters ?? []), ...(lib?.scenes ?? []), ...(lib?.props ?? [])].filter((i) =>
    query ? i.name.toLowerCase().includes(query.toLowerCase()) : true,
  )
  // 项目资产目前都是图片类，类型筛选对非图片直接过滤空
  const filteredItems = typeFilter === 'all' || typeFilter === 'image' ? allItems : []

  const moveToTrash = (item: AssetLibraryItemRead) => {
    setTrash((prev) => [{ id: item.id, name: item.name, type: item.type, url: item.reference_images?.[0]?.url, deletedAt: Date.now() }, ...prev])
    message.success(`已把「${item.name}」移入回收站`)
  }

  const restore = (id: string) => setTrash((prev) => prev.filter((t) => t.id !== id))
  const purge = (id: string) => setTrash((prev) => prev.filter((t) => t.id !== id))

  const emptyTrash = () => {
    if (trash.length === 0) return
    Modal.confirm({
      title: '清空回收站',
      content: `永久删除全部 ${trash.length} 项？此操作不可恢复。`,
      okText: '永久删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => setTrash([]),
    })
  }

  const filterContent = (
    <div className="nw-asset-filter">
      <div className="nw-asset-filter-title">按来源筛选</div>
      <Checkbox.Group value={sources} onChange={(v) => setSources(v as string[])} options={[{ label: '上传', value: 'upload' }, { label: '生成', value: 'generated' }]} />
      <div className="nw-asset-filter-title">按类型筛选</div>
      <Checkbox.Group
        value={typeFilter === 'all' ? ['image', 'video', 'audio', 'text'] : [typeFilter]}
        onChange={(v) => setTypeFilter((v.length === 1 ? v[0] : 'all') as TypeFilter)}
        options={[
          { label: '图片', value: 'image' },
          { label: '视频', value: 'video' },
          { label: '音频', value: 'audio' },
          { label: '文本', value: 'text' },
        ]}
      />
    </div>
  )

  if (!open) return null

  return (
    <div className="nw-side-panel nw-asset-panel">
      <div className="nw-side-panel-head">
        <span>资产库</span>
        <button className="nw-icon-btn" onClick={() => setActivePanel(null)}>
          <CloseOutlined />
        </button>
      </div>
      <Tabs
        tabBarStyle={{ padding: '0 16px' }}
        items={[
          {
            key: 'project',
            label: '项目资产',
            children: (
              <div className={`nw-asset-body view-${view}`}>
                <div className="nw-asset-toolbar">
                  <Input placeholder="按名称或标签搜索" value={query} onChange={(e) => setQuery(e.target.value)} allowClear size="small" />
                  <Popover content={filterContent} trigger="click" placement="bottomRight">
                    <button className="nw-icon-btn" title="筛选">
                      <FilterOutlined />
                    </button>
                  </Popover>
                </div>
                <div className="nw-asset-typebar">
                  {(['all', 'image', 'video', 'audio', 'text'] as TypeFilter[]).map((t) => (
                    <button key={t} className={`nw-asset-typechip ${typeFilter === t ? 'active' : ''}`} onClick={() => setTypeFilter(t)}>
                      {t === 'all' ? '全部' : t === 'image' ? '图片' : t === 'video' ? '视频' : t === 'audio' ? '音频' : '文本'}
                    </button>
                  ))}
                </div>
                <Segmented
                  size="small"
                  value={view}
                  onChange={(v) => setView(v as ViewSize)}
                  options={[
                    { label: '大', value: 'large' },
                    { label: '中', value: 'medium' },
                    { label: '小', value: 'small' },
                  ]}
                  style={{ marginBottom: 10 }}
                />
                {filteredItems.length === 0 ? (
                  <Empty description="还没有资源" />
                ) : (
                  <div className="nw-asset-grid">
                    {filteredItems.map((item) => (
                      <div key={item.id} className="nw-asset-card">
                        {item.reference_images?.[0] ? <img src={item.reference_images[0].url} className="nw-asset-thumb" /> : <div className="nw-asset-thumb nw-asset-thumb-empty" />}
                        <div className="nw-asset-name">{item.name}</div>
                        <div className="nw-asset-meta-row">
                          <span className="nw-asset-type">{item.type}</span>
                          <button className="nw-asset-trash-btn" title="移入回收站" onClick={() => moveToTrash(item)}>
                            <DeleteOutlined />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ),
          },
          {
            key: 'material',
            label: '素材库',
            children: (
              <div className="nw-asset-empty-block">
                <Empty description="素材库还没有内容" />
                <div className="nw-asset-empty-hint">跨项目复用的资产会出现在这里（后端暂无跨项目素材接口，已在交付报告列出）。</div>
              </div>
            ),
          },
          {
            key: 'trash',
            label: `回收站${trash.length ? ` (${trash.length})` : ''}`,
            children: (
              <div className="nw-asset-body view-medium">
                {trash.length > 0 && (
                  <button className="nw-asset-empty-trash" onClick={emptyTrash}>
                    清空回收站
                  </button>
                )}
                {trash.length === 0 ? (
                  <div className="nw-asset-empty-block">
                    <Empty description="回收站是空的" />
                    <div className="nw-asset-empty-hint">删除的资产保留 30 天，可在此还原或彻底删除。</div>
                  </div>
                ) : (
                  <div className="nw-asset-grid">
                    {trash.map((t) => (
                      <div key={t.id} className="nw-asset-card nw-asset-trash-card">
                        {t.url ? <img src={t.url} className="nw-asset-thumb" /> : <div className="nw-asset-thumb nw-asset-thumb-empty" />}
                        <div className="nw-asset-name">{t.name}</div>
                        <div className="nw-asset-trash-meta">
                          删除于 {new Date(t.deletedAt).toLocaleDateString()} · 30 天后清除
                        </div>
                        <div className="nw-asset-trash-hover">
                          <button className="nw-btn nw-btn-secondary" onClick={() => restore(t.id)}>
                            <ReloadOutlined /> 还原
                          </button>
                          <button className="nw-btn nw-btn-danger" onClick={() => purge(t.id)}>
                            <DeleteOutlined /> 彻底删除
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ),
          },
        ]}
      />
    </div>
  )
}
