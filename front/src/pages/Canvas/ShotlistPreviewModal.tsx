import { Modal, Table } from 'antd'
import type { ShotlistTextRow } from './types'

/** ShotlistPreviewModal 在付费渲染前展示免费文字分镜表预审。 */
export function ShotlistPreviewModal({
  open,
  rows,
  onCancel,
  onConfirm,
}: {
  open: boolean
  rows: ShotlistTextRow[]
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Modal
      open={open}
      title="文字版分镜表预审"
      width={980}
      okText="审完，进入开始渲染"
      cancelText="继续补充信息"
      onCancel={onCancel}
      onOk={onConfirm}
    >
      <Table
        size="small"
        pagination={false}
        rowKey="panel_index"
        dataSource={rows}
        columns={[
          { title: '格', dataIndex: 'panel_index', width: 56 },
          { title: '一句话总结', dataIndex: 'one_sentence_summary' },
          { title: '情绪', dataIndex: 'emotion', width: 96 },
          {
            title: '运动逻辑',
            width: 180,
            render: (_, row) => (row.action_beats ?? []).join(' → ') || row.motion_design?.route || '待补充',
          },
          {
            title: '镜头运动设计 6 项',
            render: (_, row) => (
              <ol className="m-0 pl-4 text-xs">
                <li>跟随对象：{row.motion_design?.follow_subject || '待补充'}</li>
                <li>运动路线：{row.motion_design?.route || '待补充'}</li>
                <li>空间解释：{row.motion_design?.spatial_explanation || '待补充'}</li>
                <li>关系变化：{row.motion_design?.relationship_change || '待补充'}</li>
                <li>停顿点：{row.motion_design?.pause_point || '待补充'}</li>
                <li>结尾信息：{row.motion_design?.ending_information || '待补充'}</li>
              </ol>
            ),
          },
        ]}
        expandable={{
          expandedRowRender: (row) => (
            <pre className="max-h-52 overflow-auto rounded bg-black p-3 text-xs text-white">
              {JSON.stringify(row.six_elements_for_video_model ?? {}, null, 2)}
            </pre>
          ),
        }}
      />
    </Modal>
  )
}
