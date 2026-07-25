import type { ProjectRead } from '../../../services/generated'

export type SkillMode = 'long_video' | 'commercial' | 'short_drama'

export type SkillCard = {
  key: SkillMode
  title: string
  subtitle: string
  accent: string
  icon: string
  hot?: boolean
}

export type HomeProjectCard = {
  id: string
  name: string
  description: string
  updatedAt: string
  progress: number
}

export const HOME_SKILL_CARDS: SkillCard[] = [
  {
    key: 'long_video',
    title: '长视频制作',
    subtitle: '完整叙事、系列节目和品牌纪录片',
    accent: 'linear-gradient(135deg, rgba(33,150,243,.16), rgba(76,217,100,.10))',
    icon: '🎬',
  },
  {
    key: 'commercial',
    title: '商业广告制作',
    subtitle: '产品卖点、镜头脚本和投放素材',
    accent: 'linear-gradient(135deg, rgba(255,149,0,.24), rgba(0,122,255,.12))',
    icon: '🧴',
    hot: true,
  },
  {
    key: 'short_drama',
    title: '短剧制作',
    subtitle: '爽点、反转、付费卡点和竖屏分镜',
    accent: 'linear-gradient(135deg, rgba(175,82,222,.20), rgba(90,200,250,.13))',
    icon: '🎭',
    hot: true,
  },
]

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
    description: project.description ?? '',
    updatedAt,
    progress: project.progress ?? 0,
  }
}
