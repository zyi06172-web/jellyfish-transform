import { OpenAPI } from '../../../services/generated'

/** 从后端下载 URL 中反取 file_id，统一走当前 API base 拼接。 */
function tryExtractFileIdFromUrl(value: string): string | null {
  try {
    const url = new URL(value)
    const match = url.pathname.match(/\/api\/v1\/studio\/files\/([^/]+)\/download\/?$/)
    if (match?.[1]) return decodeURIComponent(match[1])
  } catch {
    // URL 解析失败时按原值兜底。
  }
  return null
}

/** 把 file_id、相对路径或绝对 URL 统一解析为浏览器可访问的资产 URL。 */
export function resolveAssetUrl(value?: string | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined

  if (/^(?:[a-z][a-z\d+\-.]*:)?\/\//i.test(trimmed) || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    const fileId = tryExtractFileIdFromUrl(trimmed)
    if (fileId) return buildFileDownloadUrl(fileId)
    return trimmed
  }

  if (!trimmed.includes('/') && !trimmed.includes(':')) {
    return buildFileDownloadUrl(trimmed)
  }

  try {
    const fallbackBase =
      window.__ENV?.BACKEND_URL ||
      import.meta.env.VITE_BACKEND_URL ||
      import.meta.env.VITE_API_BASE_URL ||
      'http://localhost:8000'
    return new URL(trimmed, OpenAPI.BASE || fallbackBase).toString()
  } catch {
    return trimmed
  }
}

/** 生成文件下载地址，用于画布节点和导出入口。 */
export function buildFileDownloadUrl(fileId?: string | null): string | undefined {
  if (!fileId) return undefined
  return resolveAssetUrl(`/api/v1/studio/files/${encodeURIComponent(fileId)}/download`)
}
