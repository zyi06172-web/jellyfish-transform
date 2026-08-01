import { TextNode } from './text/TextNode'
import { ImageNode } from './image/ImageNode'
import { VideoNode } from './video/VideoNode'
import { AudioNode } from './audio/AudioNode'
import { ScriptNode } from './script/ScriptNode'
import { ScriptBreakdownNode } from './script/ScriptBreakdownNode'
import { CharacterNode } from './character/CharacterNode'
import { LocationNode } from './location/LocationNode'
import { PropNode } from './prop/PropNode'
import { StoryboardNode } from './storyboard/StoryboardNode'
import { ShotGroupNode } from './shotgroup/ShotGroupNode'
import { KeyframeNode } from './keyframe/KeyframeNode'
import { ShotlistTextNode } from './shotlist/ShotlistTextNode'
import { ShotlistRenderNode } from './shotlist/ShotlistRenderNode'
import { VideoShotNode } from './video/VideoShotNode'
import { ProductNode } from './product/ProductNode'
import { StickyNode } from './sticky/StickyNode'
import { MaterialNode } from './material/MaterialNode'

/** nodeTypes 必须在模块顶层定义为常量：写在组件内部会导致每次 render 重建，
 *  引发整画布重绘（React Flow 最常见的性能事故，计划书 §1.4 / 业务附件原则1）。 */
export const nodeTypes = {
  text: TextNode,
  image: ImageNode,
  video: VideoNode,
  audio: AudioNode,
  script: ScriptNode,
  script_breakdown: ScriptBreakdownNode,
  character: CharacterNode,
  location: LocationNode,
  prop: PropNode,
  storyboard: StoryboardNode,
  shot_group: ShotGroupNode,
  keyframe: KeyframeNode,
  shotlist_text: ShotlistTextNode,
  shotlist_render: ShotlistRenderNode,
  video_shot: VideoShotNode,
  product: ProductNode,
  sticky: StickyNode,
  material: MaterialNode,
} as const
