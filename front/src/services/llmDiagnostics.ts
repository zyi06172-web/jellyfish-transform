import { OpenAPI } from './generated'

export type LlmDiagnosticStatus = 'ok' | 'warning' | 'error'

export type LlmDiagnosticRead = {
  status: LlmDiagnosticStatus
  message: string
  checked_url?: string | null
  provider?: string | null
  model_id?: string | null
}

type ApiResponse<T> = {
  code: number
  message: string
  data: T | null
}

async function postDiagnostic(path: string): Promise<LlmDiagnosticRead> {
  const response = await fetch(`${OpenAPI.BASE}${path}`, { method: 'POST' })
  const body = (await response.json()) as ApiResponse<LlmDiagnosticRead>
  if (!response.ok || !body.data) {
    throw new Error(body.message || '诊断请求失败')
  }
  return body.data
}

export function diagnoseProvider(providerId: string) {
  return postDiagnostic(`/api/v1/llm/providers/${encodeURIComponent(providerId)}/diagnose`)
}

export function diagnoseModel(modelId: string) {
  return postDiagnostic(`/api/v1/llm/models/${encodeURIComponent(modelId)}/diagnose`)
}
