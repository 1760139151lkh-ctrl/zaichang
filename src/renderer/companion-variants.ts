import type { SceneSnapshot } from '../shared/scenes';

export type CompanionMoment = 'chat' | 'reading' | 'planning' | 'rest' | 'play' | 'night';

export interface CompanionArtwork {
  image: string;
  variants?: Partial<Record<CompanionMoment, string>>;
}

/** Only the visible activity and light choose artwork; personality is separate. */
export function companionMoment({ reading = false, night = false }: { reading?: boolean; night?: boolean }): CompanionMoment {
  return reading ? 'reading' : night ? 'night' : 'chat';
}

/** Only already-projected presentation types select an activity; prose,
 * guessed interests and scene source bodies are never inspected here. */
export function companionSceneMoment(scene: SceneSnapshot | undefined): CompanionMoment | undefined {
  switch (scene?.kind) {
    case 'planning': return 'planning';
    case 'study': case 'study_reference': case 'note': case 'note_reference':
    case 'campus': case 'campus_reference': case 'discussion': return 'reading';
    case 'curiosity': case 'curiosity_reference': return 'play';
    // Shared creation uses a typed Work reference, not a distinct Scene kind.
    case 'map': return scene.storySetting ? 'play' : undefined;
    default: return undefined;
  }
}

/** A missing pose keeps the selected character's existing artwork. */
export function companionArtworkImage(artwork: CompanionArtwork | undefined, moment: CompanionMoment = 'chat') {
  return artwork?.variants?.[moment] ?? artwork?.image;
}
