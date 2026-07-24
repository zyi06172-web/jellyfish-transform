import { OpenAPI } from './generated'

export type AutoConfirmLevel = 'L1' | 'L2' | 'L3'

export type ShotCandidateAutoConfirmResult = {
  shot_id: string
  level: AutoConfirmLevel
  linked_existing: number
  created_and_linked: number
  skipped: number
  processed_candidate_ids: number[]
  messages: string[]
  state: unknown
}

export type ChapterCandidateAutoConfirmResult = {
  chapter_id: string
  level: AutoConfirmLevel
  shot_count: number
  linked_existing: number
  created_and_linked: number
  skipped: number
  results: ShotCandidateAutoConfirmResult[]
}

type ApiResponse<T> = {
  code: number
  message: string
  data: T | null
}

async function postAutoConfirm<T>(path: string, level: AutoConfirmLevel): Promise<T> {
  const response = await fetch(`${OpenAPI.BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level }),
  })
  const body = (await response.json()) as ApiResponse<T>
  if (!response.ok || !body.data) {
    throw new Error(body.message || '自动确认失败')
  }
  return body.data
}

export function autoConfirmShotCandidates(shotId: string, level: AutoConfirmLevel) {
  return postAutoConfirm<ShotCandidateAutoConfirmResult>(
    `/api/v1/studio/shots/${encodeURIComponent(shotId)}/auto-confirm-candidates`,
    level,
  )
}

export function autoConfirmChapterCandidates(chapterId: string, level: AutoConfirmLevel) {
  return postAutoConfirm<ChapterCandidateAutoConfirmResult>(
    `/api/v1/studio/chapters/${encodeURIComponent(chapterId)}/auto-confirm-candidates`,
    level,
  )
}
