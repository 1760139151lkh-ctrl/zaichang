export type CompanionMoment = 'chat' | 'reading' | 'night';

export interface CompanionArtwork {
  image: string;
  variants?: Partial<Record<CompanionMoment, string>>;
}

/** Only the visible activity and light choose artwork; personality is separate. */
export function companionMoment({ reading = false, night = false }: { reading?: boolean; night?: boolean }): CompanionMoment {
  return reading ? 'reading' : night ? 'night' : 'chat';
}

/** A missing pose keeps the selected character's existing artwork. */
export function companionArtworkImage(artwork: CompanionArtwork | undefined, moment: CompanionMoment = 'chat') {
  return artwork?.variants?.[moment] ?? artwork?.image;
}
