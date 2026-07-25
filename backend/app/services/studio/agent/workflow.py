from __future__ import annotations

from dataclasses import dataclass
from enum import IntEnum

from app.models.types import AgentSessionStage


class SkillStep(IntEnum):
    """Flova Process Plan 的 7 步与 4b 音色锚点。"""

    script = 1
    final_video_spec = 2
    storyboard = 3
    elements = 4
    voice_anchor = 40
    shot_video = 5
    audio_layer = 6
    assemble_export = 7


SKILL_STEP_DEPENDENCIES: dict[SkillStep, frozenset[SkillStep]] = {
    SkillStep.script: frozenset(),
    SkillStep.final_video_spec: frozenset({SkillStep.script}),
    SkillStep.storyboard: frozenset({SkillStep.script, SkillStep.final_video_spec}),
    SkillStep.elements: frozenset({SkillStep.storyboard}),
    SkillStep.voice_anchor: frozenset({SkillStep.elements}),
    SkillStep.shot_video: frozenset(
        {
            SkillStep.final_video_spec,
            SkillStep.storyboard,
            SkillStep.elements,
            SkillStep.voice_anchor,
        }
    ),
    SkillStep.audio_layer: frozenset({SkillStep.storyboard}),
    SkillStep.assemble_export: frozenset(
        {
            SkillStep.storyboard,
            SkillStep.elements,
            SkillStep.shot_video,
            SkillStep.audio_layer,
        }
    ),
}


STAGE_DEPENDENCIES: dict[AgentSessionStage, frozenset[AgentSessionStage]] = {
    AgentSessionStage.intake: frozenset(),
    AgentSessionStage.spec_review: frozenset({AgentSessionStage.intake}),
    AgentSessionStage.storyboard: frozenset({AgentSessionStage.spec_review}),
    AgentSessionStage.extract: frozenset({AgentSessionStage.storyboard}),
    AgentSessionStage.auto_confirm: frozenset({AgentSessionStage.extract}),
    AgentSessionStage.elements_gen: frozenset({AgentSessionStage.auto_confirm}),
    AgentSessionStage.elements_review: frozenset({AgentSessionStage.elements_gen}),
    AgentSessionStage.voice_anchor: frozenset({AgentSessionStage.elements_review}),
    AgentSessionStage.shot_video: frozenset({AgentSessionStage.voice_anchor}),
    AgentSessionStage.audio_layer: frozenset({AgentSessionStage.storyboard}),
    AgentSessionStage.assemble_export: frozenset(
        {
            AgentSessionStage.storyboard,
            AgentSessionStage.elements_review,
            AgentSessionStage.shot_video,
            AgentSessionStage.audio_layer,
        }
    ),
    AgentSessionStage.completed: frozenset({AgentSessionStage.assemble_export}),
}

NEXT_STAGE: dict[AgentSessionStage, AgentSessionStage] = {
    AgentSessionStage.intake: AgentSessionStage.spec_review,
    AgentSessionStage.spec_review: AgentSessionStage.storyboard,
    AgentSessionStage.storyboard: AgentSessionStage.extract,
    AgentSessionStage.extract: AgentSessionStage.auto_confirm,
    AgentSessionStage.auto_confirm: AgentSessionStage.elements_gen,
    AgentSessionStage.elements_gen: AgentSessionStage.elements_review,
    AgentSessionStage.elements_review: AgentSessionStage.voice_anchor,
    AgentSessionStage.voice_anchor: AgentSessionStage.shot_video,
    AgentSessionStage.shot_video: AgentSessionStage.audio_layer,
    AgentSessionStage.audio_layer: AgentSessionStage.assemble_export,
    AgentSessionStage.assemble_export: AgentSessionStage.completed,
}


@dataclass(frozen=True)
class GuardResult:
    """状态机 guard 的判定结果。"""

    allowed: bool
    reason: str = ""
    missing: frozenset[AgentSessionStage] = frozenset()


def can_enter_stage(
    stage: AgentSessionStage,
    *,
    confirmed_stages: frozenset[AgentSessionStage],
    completed_stages: frozenset[AgentSessionStage],
) -> GuardResult:
    """检查是否允许进入目标阶段。"""

    dependencies = STAGE_DEPENDENCIES[stage]
    satisfied = confirmed_stages | completed_stages
    missing = frozenset(dep for dep in dependencies if dep not in satisfied)
    if missing:
        labels = ", ".join(sorted(item.value for item in missing))
        return GuardResult(False, f"依赖未满足：{labels}", missing)
    return GuardResult(True)


def assert_skill_step_dependencies_satisfied(
    step: SkillStep,
    *,
    completed_steps: frozenset[SkillStep],
) -> GuardResult:
    """检查 Flova 官方 Skill 步骤依赖表，供编排层复用。"""

    dependencies = SKILL_STEP_DEPENDENCIES[step]
    missing = frozenset(dep for dep in dependencies if dep not in completed_steps)
    if missing:
        labels = ", ".join(str(int(item)) if item is not SkillStep.voice_anchor else "4b" for item in sorted(missing))
        return GuardResult(False, f"Skill 依赖未满足：{labels}")
    return GuardResult(True)
