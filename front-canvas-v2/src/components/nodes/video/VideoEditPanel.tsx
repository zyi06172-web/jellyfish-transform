import { useEffect, useMemo, useState } from 'react'
import { Modal } from 'antd'
import type { VideoClip } from '../../../types/canvas'
import './videoEditPanel.css'

interface VideoEditPanelProps {
  open: boolean
  clips: VideoClip[]
  onClose: () => void
  onSave: (clips: VideoClip[]) => void
}

function sorted(clips: VideoClip[]) {
  return [...clips].sort((a, b) => a.order - b.order)
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** 视频剪辑轨道：前端排序预览 + 顺序保存，不做服务端 ffmpeg 合成导出。 */
export function VideoEditPanel({ open, clips, onClose, onSave }: VideoEditPanelProps) {
  const [draft, setDraft] = useState<VideoClip[]>(() => sorted(clips))
  const [currentIndex, setCurrentIndex] = useState(0)
  const total = useMemo(() => draft.reduce((sum, clip) => sum + clip.duration, 0), [draft])

  useEffect(() => {
    if (!open) return
    setDraft(sorted(clips))
    setCurrentIndex(0)
  }, [clips, open])

  const moveClip = (fromId: string, toId: string) => {
    if (fromId === toId) return
    setDraft((prev) => {
      const from = prev.findIndex((clip) => clip.id === fromId)
      const to = prev.findIndex((clip) => clip.id === toId)
      if (from < 0 || to < 0) return prev
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next.map((clip, index) => ({ ...clip, order: index }))
    })
  }

  let cursor = 0
  const withTimes = draft.map((clip) => {
    const start = cursor
    cursor += clip.duration
    return { ...clip, start, end: cursor }
  })
  const current = withTimes[currentIndex] ?? withTimes[0]

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={() =>
        onSave(
          withTimes.map((clip) => ({
            id: clip.id,
            name: clip.name,
            videoUrl: clip.videoUrl,
            thumbnailUrl: clip.thumbnailUrl,
            duration: clip.duration,
            order: clip.order,
          })),
        )
      }
      okText="保存顺序"
      cancelText="关闭"
      width={860}
      title="视频编辑"
    >
      <div className="nw-video-editor">
        <div className="nw-video-preview-area">
          {current?.videoUrl ? (
            <video
              key={current.id}
              src={current.videoUrl}
              controls
              autoPlay
              onEnded={() => setCurrentIndex((idx) => (idx + 1) % Math.max(withTimes.length, 1))}
            />
          ) : (
            <div className="nw-video-preview-empty">暂无可预览片段</div>
          )}
        </div>
        <div className="nw-timeline-head">
          <span>片段轨道（{draft.length} 个视频）</span>
          <span>总时长: {formatTime(total)}</span>
        </div>
        <div className="nw-timeline-ruler">
          {withTimes.map((clip) => (
            <span key={clip.id}>{formatTime(clip.start)}</span>
          ))}
          <span>{formatTime(total)}</span>
        </div>
        <div className="nw-clip-track">
          {withTimes.map((clip, index) => (
            <div
              key={clip.id}
              className={`nw-clip-card ${index === currentIndex ? 'active' : ''}`}
              draggable
              onDragStart={(event) => event.dataTransfer.setData('text/plain', clip.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => moveClip(event.dataTransfer.getData('text/plain'), clip.id)}
              onClick={() => setCurrentIndex(index)}
            >
              {clip.thumbnailUrl ? <img src={clip.thumbnailUrl} /> : <div className="nw-clip-thumb" />}
              <b>{clip.name}</b>
              <span>{clip.duration}s</span>
              <small>{formatTime(clip.start)} - {formatTime(clip.end)}</small>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}
