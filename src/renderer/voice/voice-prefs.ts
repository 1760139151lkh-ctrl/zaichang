import { SPEECH_LANGUAGES, type SpeechLanguage } from '../../shared/speech-text';

/*
 * How voice input behaves on this computer. Like the appearance and split-view choices
 * these are device preferences kept in the browser's storage: they are not memory, are not
 * sent to the model, and do not follow the person to another device.
 *
 * MOBILE: each device keeps its own (the phone has its own microphone and clipboard rules).
 */

export interface VoicePrefs {
  /** Leave the dictated words on the clipboard when a dictation ends. */
  keepInClipboard: boolean;
  language: SpeechLanguage;
  /** Empty: the system default microphone. */
  deviceId: string;
}

export const DEFAULT_VOICE_PREFS: VoicePrefs = { keepInClipboard: true, language: 'auto', deviceId: '' };
const KEY = 'zaichang.voice-input.v1';

export function readVoicePrefs(): VoicePrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<VoicePrefs>;
    return {
      keepInClipboard: typeof raw.keepInClipboard === 'boolean' ? raw.keepInClipboard : DEFAULT_VOICE_PREFS.keepInClipboard,
      language: (SPEECH_LANGUAGES as readonly string[]).includes(raw.language as string) ? raw.language as SpeechLanguage : DEFAULT_VOICE_PREFS.language,
      deviceId: typeof raw.deviceId === 'string' && raw.deviceId.length < 300 ? raw.deviceId : '',
    };
  } catch { return DEFAULT_VOICE_PREFS; }
}
