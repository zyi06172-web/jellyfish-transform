import { createContext, useContext } from 'react'
import type { ProjectRead } from '../services/generated'

/** 画布画面比例来自项目设置，不硬编码（原则5）。所有节点通过这个 context 读取，
 *  而不是各自写死 9:16/16:9。 */
export const ProjectContext = createContext<ProjectRead | null>(null)

export function useProjectSettings() {
  const project = useContext(ProjectContext)
  return {
    project,
    aspectRatio: project?.default_video_ratio || '16:9',
  }
}
