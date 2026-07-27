import { ArrowUpOutlined, CheckOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Input, Spin } from 'antd'
import { useState } from 'react'
import type { AgentMessageRead, AgentQuestionCardRead } from '../../../../../services/generated'

function messageClass(role: AgentMessageRead['role']) {
  return role === 'user' ? 'ml-10 bg-white text-black' : 'mr-10 bg-white/[.08] text-white/72'
}

export function AgentChat({
  messages,
  questionCard,
  revision,
  loading,
  submitting,
  error,
  onChoice,
  onText,
  onRefresh,
}: {
  messages: AgentMessageRead[]
  questionCard?: AgentQuestionCardRead | null
  revision: number
  loading: boolean
  submitting: boolean
  error?: string | null
  onChoice: (choiceId: string) => void
  onText: (text: string) => void
  onRefresh: () => void
}) {
  const [text, setText] = useState('')
  const submit = () => {
    const value = text.trim()
    if (!value) return
    onText(value)
    setText('')
  }

  return (
    <aside className="flex min-h-0 flex-col border-l border-white/[.06] bg-white/[.035] text-white">
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/[.06] px-6">
        <div>
          <div className="text-base font-semibold">Agent 对话</div>
          <div className="text-xs text-white/42">revision {revision}</div>
        </div>
        <Button shape="circle" type="text" icon={<ReloadOutlined />} className="!text-white" onClick={onRefresh} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {error ? <Alert className="mb-4" type="warning" showIcon message={error} /> : null}
        {loading ? (
          <div className="flex h-full items-center justify-center"><Spin /></div>
        ) : (
          <div className="space-y-3">
            {messages.length ? (
              messages.map((message, index) => (
                <div key={`${message.role}-${index}-${message.content}`} className={`rounded-lg px-4 py-3 text-sm leading-relaxed ${messageClass(message.role)}`}>
                  <div className="mb-1 text-[11px] opacity-60">{message.kind}</div>
                  {message.content}
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-white/[.12] bg-white/[.04] p-4 text-sm text-white/42">
                正在分析剧情…
              </div>
            )}
            {questionCard ? (
              <div className="mt-5 rounded-lg border border-white/[.08] bg-white/[.06] p-4 shadow-sm">
                <div className="mb-3 flex items-start gap-2 text-sm font-semibold">
                  <CheckOutlined className="mt-1 text-white/40" />
                  <span>{questionCard.question}</span>
                </div>
                <div className="space-y-2">
                  {(questionCard.options ?? []).map((option, index) => (
                    <button
                      key={option.id}
                      type="button"
                      disabled={submitting}
                      onClick={() => onChoice(option.id)}
                      className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition ${
                        option.effect === 'confirm_and_advance' && index === 0
                          ? 'border-white bg-white text-black'
                          : 'border-white/[.08] bg-white/[.05] text-white/68 hover:bg-white/[.09]'
                      }`}
                    >
                      <div className="font-semibold">{option.label}</div>
                      <div className="mt-1 text-xs opacity-65">{option.effect}</div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
      <div className="shrink-0 border-t border-white/[.06] p-4">
        <div className="rounded-lg border border-white/[.08] bg-white/[.08] p-3 shadow-sm">
          <Input.TextArea
            value={text}
            onChange={(event) => setText(event.target.value)}
            autoSize={{ minRows: 2, maxRows: 4 }}
            bordered={false}
            placeholder="输入修改意见或补充要求"
            className="flova-chat-input"
            onPressEnter={(event) => {
              if (!event.shiftKey) {
                event.preventDefault()
                submit()
              }
            }}
          />
          <div className="mt-3 flex items-center gap-2">
            <Button shape="circle" icon={<PlusOutlined />} />
            <Button className="ml-auto" shape="circle" loading={submitting} icon={<ArrowUpOutlined />} onClick={submit} />
          </div>
        </div>
      </div>
    </aside>
  )
}
