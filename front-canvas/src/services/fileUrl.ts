import { OpenAPI } from './generated/core/OpenAPI'

export function buildFileDownloadUrl(fileId: string): string {
  return `${OpenAPI.BASE}/api/v1/studio/files/${fileId}/download`
}
