import { createContext } from 'react';
import type { CuriosityFollowupReference } from '../shared/curiosity-source';
import type { LetterReference } from '../shared/reflective-letter';
import type { NoteReference } from '../shared/note-presentation';

/** The ordinary composer's current prose pointer, for a local reading mark.
 * These existing addresses carry no text, owner state or source permission. */
export const ConversationTextFocusContext = createContext<{
  curiosityReference?: CuriosityFollowupReference;
  letterReference?: LetterReference;
  noteReference?: NoteReference;
}>({});
