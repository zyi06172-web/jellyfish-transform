import type { ProjectCreate, ProjectRead, ProjectStyle } from '../../../services/generated'

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

export type HomeProjectCreationDraft = {
  requestBody: ProjectCreate
  title: string
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

const FALLBACK_TITLE_BY_SKILL: Record<SkillMode, string> = {
  long_video: '未命名长视频项目',
  commercial: '未命名广告项目',
  short_drama: '未命名短剧项目',
}

const VIDEO_RATIO_BY_SKILL: Record<SkillMode, string> = {
  long_video: '16:9',
  commercial: '1:1',
  short_drama: '9:16',
}

/** 生成稳定的本地项目 ID，继续沿用现有项目创建接口。 */
export function createHomeProjectId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `p_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

/** 模拟首页 Agent 对剧情大纲的标题总结，后续可替换为真实标题生成适配器。 */
export function summarizeHomeProjectTitle(prompt: string, mode: SkillMode) {
  const cleaned = prompt
    .replace(/\s+/g, ' ')
    .replace(/[“”"'《》]/g, '')
    .trim()
  const firstClause = cleaned.split(/[，。！？,.!?；;]/)[0]?.trim()
  if (firstClause && firstClause.length >= 4) {
    return firstClause.length > 18 ? `${firstClause.slice(0, 18)}...` : firstClause
  }
  return FALLBACK_TITLE_BY_SKILL[mode]
}

/** 根据用户首页输入准备项目创建请求，把创建规则集中到页面外的单一接口。 */
export function prepareHomeProjectCreationDraft(args: {
  id: string
  prompt: string
  model: string
  skill: SkillCard
}): HomeProjectCreationDraft {
  const content = args.prompt.trim()
  const title = summarizeHomeProjectTitle(content, args.skill.key)
  const requestedAt = new Date().toISOString()
  return {
    title,
    requestBody: {
      id: args.id,
      name: title,
      description: [
        `Skill: ${args.skill.title}`,
        `Model: ${args.model}`,
        '',
        content,
      ].join('\n'),
      style: '真人都市' as ProjectStyle,
      visual_style: '现实',
      seed: Math.floor(Math.random() * 99999),
      unify_style: true,
      default_video_ratio: VIDEO_RATIO_BY_SKILL[args.skill.key],
      progress: 8,
      stats: {
        created_from: 'flova_home_prompt',
        created_from_prompt_at: requestedAt,
        selected_skill: args.skill.key,
        selected_skill_title: args.skill.title,
        selected_model: args.model,
        source_prompt: content,
        agent_summary_title: title,
        updated_at: requestedAt,
      },
    },
  }
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
