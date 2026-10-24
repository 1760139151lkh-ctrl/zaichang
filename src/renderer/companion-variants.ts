import type { SceneSnapshot } from '../shared/scenes';
import type { CompanionActivity } from '../shared/companion-activity';

export type CompanionMoment = CompanionActivity | 'night';

/** Only the visible activity and light choose artwork; personality is separate. */
export function companionMoment({ reading = false, night = false }: { reading?: boolean; night?: boolean }): CompanionMoment {
  return reading ? 'reading' : night ? 'night' : 'chat';
}

/** Only already-projected presentation types select an activity; prose,
 * guessed interests and scene source bodies are never inspected here. */
export function companionSceneMoment(scene: SceneSnapshot | undefined): CompanionMoment | undefined {
  switch (scene?.kind) {
    case 'planning': return 'planning';
    case 'study': case 'study_reference': return 'study';
    case 'rehearsal': case 'rehearsal_reference': return 'listening';
    case 'note': case 'note_reference':
    case 'campus': case 'campus_reference': case 'discussion': return 'reading';
    case 'curiosity': case 'curiosity_reference': return 'play';
    // Shared creation uses a typed Work reference, not a distinct Scene kind.
    case 'map': return scene.storySetting ? 'play' : 'attention';
    case 'figure': case 'weather': case 'environment': return 'attention';
    default: return undefined;
  }
}

