import { StudioFilesService } from './generated'
import { buildFileDownloadUrl } from './fileUrl'

/**
 * §8.2 上传：把本地图片/视频传到后端存储，返回可用于素材节点的 file_id + 下载 URL。
 * 走现有 `POST /api/v1/studio/files/upload`（multipart），不新增后端接口。
 */
export async function uploadMaterial(file: File, projectId?: string): Promise<{ fileId?: string; url?: string; error?: string }> {
  try {
    const res = await StudioFilesService.uploadFileApiApiV1StudioFilesUploadPost({
      formData: {
        file: file as unknown as string,
        project_id: projectId ?? null,
        usage_kind: projectId ? 'canvas_material' : null,
      },
    })
    const fileId = res.data?.id
    if (!fileId) return { error: '上传成功但未返回文件 ID' }
    return { fileId, url: buildFileDownloadUrl(fileId) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : '上传失败，请检查后端 /studio/files/upload' }
  }
}
