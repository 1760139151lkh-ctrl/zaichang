/*
 * The parts of the voice-input contract that need no validation library, so the
 * separate speech process can import them without carrying zod along.
 * See speech.ts for the full contract and the MOBILE PORT NOTE.
 */

/** Fixed capture format. The renderer converts whatever the microphone gives into
 * this before it crosses the bridge; the engine never resamples. */
export const SPEECH_AUDIO = Object.freeze({
  sampleRate: 16_000,
  /** The renderer batches 100 ms of audio per message. */
  chunkSamples: 1_600,
  /** Hard ceiling for one message (500 ms). */
  maxChunkSamples: 8_000,
  /** One dictation never runs unattended longer than this. */
  maxSessionMs: 10 * 60_000,
  /** Audio kept while the engine is still loading: the person already started talking. */
  maxQueuedMs: 20_000,
  /** Nothing said after the microphone opened. */
  firstSpeechTimeoutMs: 12_000,
  /** Quiet for this long after the last words. */
  silenceTimeoutMs: 15_000,
});

export const SPEECH_LANGUAGES = ['auto', 'zh', 'en', 'yue', 'ja', 'ko'] as const;
export type SpeechLanguage = (typeof SPEECH_LANGUAGES)[number];
export const SPEECH_LANGUAGE_LABELS: Readonly<Record<SpeechLanguage, string>> = Object.freeze({
  auto: '自动判断', zh: '普通话（可夹英文）', en: 'English', yue: '粤语', ja: '日本語', ko: '한국어',
});

/* ---- text joining, shared so the clipboard text and the field text read the same ---- */

const wordLike = /[A-Za-z0-9]/;
const sentenceEnd = /[.,!?;:)\]"'%]/;

/**
 * Space between two stretches of dictated text. Chinese runs together; English
 * words and numbers need one space; nothing is added beside spaces or line breaks.
 */
export function speechSeparator(left: string, right: string): '' | ' ' {
  if (!left || !right) return '';
  const a = left.slice(-1), b = right.slice(0, 1);
  if (/\s/.test(a) || /\s/.test(b)) return '';
  return (wordLike.test(a) || sentenceEnd.test(a)) && wordLike.test(b) ? ' ' : '';
}

export function joinSpeechText(parts: readonly string[]): string {
  let text = '';
  for (const raw of parts) {
    const part = raw.trim();
    if (part) text += speechSeparator(text, part) + part;
  }
  return text;
}

/** Recognizer output with markup, control characters and stray spacing removed. */
export function cleanSpeechText(raw: string): string {
  return raw.replace(/<\|[^|>]*\|>/g, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[ \t 　]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}
