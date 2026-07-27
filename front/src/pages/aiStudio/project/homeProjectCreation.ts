import type { ProjectRead } from '../../../services/generated'

export type HomeProjectCard = {
  id: string
  name: string
  description: string
  updatedAt: string
  progress: number
}

export const DEFAULT_CANVAS_PROMPT =
  '新建女娲创作画布：请先创建一个可继续补充剧本、角色和资产的空白视频项目。'

export const DEFAULT_CANVAS_SKILL_KEY = 'short_drama'

/** 清理历史首页创建时写入描述的技能/模型元信息，画布卡片只展示创作内容。 */
export function cleanHomeProjectDescription(description?: string | null) {
  return (description ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('技能：') && !line.startsWith('模型：'))
    .join('\n')
}

/** 生成首页创建幂等键，让重复提交不会重复创建项目。 */
export function createHomePromptIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `home_prompt_${crypto.randomUUID()}`
  }
  return `home_prompt_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

/** 将后端项目读取结果压成首页最近项目需要的轻量卡片。 */
export function toHomeProjectCard(project: ProjectRead): HomeProjectCard {
  const stats = (project.stats ?? {}) as Record<string, unknown>
  const updatedAt =
    (typeof stats.updated_at === 'string' && stats.updated_at) ||
    (typeof stats.updatedAt === 'string' && stats.updatedAt) ||
    new Date().toLocaleString()
  return {
    id: project.id,
    name: project.name,
    description: cleanHomeProjectDescription(project.description),
    updatedAt,
    progress: project.progress ?? 0,
  }
}
