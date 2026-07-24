import React from 'react'
import { PlayCircleOutlined } from '@ant-design/icons'

/** 社区 TV 占位页，先保留入口，后续接作品流和模板社区。 */
const CommunityTV: React.FC = () => {
  return (
    <div className="flex h-full items-center justify-center bg-[#050505] px-8 text-white">
      <div className="max-w-xl text-center">
        <div className="mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-[32px] border border-white/12 bg-white/[.055] text-5xl text-white/72">
          <PlayCircleOutlined />
        </div>
        <h1 className="text-5xl font-bold tracking-normal">社区TV</h1>
        <p className="mt-5 text-lg leading-relaxed text-white/45">
          这里会放短剧案例、Skill 模板和团队作品流。第一版先保留导航入口，避免干扰主页和 Agent 工作台主流程。
        </p>
      </div>
    </div>
  )
}

export default CommunityTV
