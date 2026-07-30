import { Alert, Button, Skeleton, Spin } from 'antd'

/** NodeLoadingState 在生成中保持节点可拖动，不用整块空白替代内容。 */
export function NodeLoadingState({ label = '正在生成…' }: { label?: string }) {
  return (
    <div className="nuwa-node-state">
      <Spin size="small" />
      <span>{label}</span>
      <Skeleton active paragraph={{ rows: 2 }} title={false} className="nuwa-node-skeleton" />
    </div>
  )
}

/** NodeEmptyState 用于上游不足或等待 Agent 写入时的人话提示。 */
export function NodeEmptyState({ label }: { label: string }) {
  return <div className="nuwa-node-empty">{label}</div>
}

/** NodeErrorState 展示可行动错误文案，并把重试交回节点自己的业务处理。 */
export function NodeErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Alert
      type="error"
      showIcon
      message={message || '这一步失败了，请检查上游输入后重试。'}
      action={onRetry ? <Button size="small" onClick={onRetry}>重试</Button> : undefined}
    />
  )
}
