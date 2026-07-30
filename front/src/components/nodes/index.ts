import { ScriptNode } from './script/ScriptNode'
import { CharacterNode } from './character/CharacterNode'
import { LocationNode } from './location/LocationNode'
import { PropNode } from './prop/PropNode'
import { StoryboardNode } from './storyboard/StoryboardNode'
import { ShotGroupNode } from './shotgroup/ShotGroupNode'
import { KeyframeNode } from './keyframe/KeyframeNode'
import { ShotlistTextNode } from './shotlist/ShotlistTextNode'
import { ShotlistRenderNode } from './shotlist/ShotlistRenderNode'
import { VideoNode } from './video/VideoNode'

export const nodeTypes = {
  script: ScriptNode,
  character: CharacterNode,
  location: LocationNode,
  prop: PropNode,
  storyboard: StoryboardNode,
  shot_group: ShotGroupNode,
  keyframe: KeyframeNode,
  shotlist_text: ShotlistTextNode,
  shotlist_render: ShotlistRenderNode,
  video: VideoNode,
} as const
