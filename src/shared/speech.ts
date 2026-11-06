import { z } from 'zod';
import { SPEECH_AUDIO, SPEECH_LANGUAGES } from './speech-text';
export * from './speech-text';

/*
 * Local voice input ("dictation"): the contract both sides of the bridge share.
 *
 * What it is: the person speaks, words appear at the caret of the field they are
 * writing in, and the finished words also stay on the clipboard. It never sends a
 * message, saves a note, or becomes a memory by itself - it only types for them.
 *
 * Desktop today: the renderer captures the microphone (getUserMedia + an
 * AudioWorklet), Electron main owns the permission, the model files and the
 * clipboard, and a separate utility process runs sherpa-onnx with SenseVoice.
 * The verified model is included with the application; runtime has no downloader.
 * Audio never leaves this computer and is never written to disk.
 *
 * MOBILE PORT NOTE - the phone app (iOS Swift first, Android later) has to change
 * the platform parts of this feature when it is built, and keep the rest:
 *   keep    : the event meaning below (partial / final / discard / ended), segment
 *             ids, the 16 kHz mono float format, the model files and the wording;
 *   replace : capture (AVAudioEngine / AudioRecord instead of getUserMedia), the
 *             runtime (sherpa-onnx Swift / Kotlin API in the app process; a small
 *             streaming model for partials, SenseVoice for finals), the microphone
 *             permission flow, writing the transcript into the native text field's
 *             composing region, and the clipboard (UIPasteboard / ClipboardManager);
 *   see docs/evidence/2026-11-05-voice-input.md, section "手机端".
 */

export type SpeechMicrophoneAccess = 'granted' | 'denied' | 'restricted' | 'not-determined' | 'unknown';

export type SpeechModelFailure = 'integrity';
export type SpeechModelStatus =
  | { state: 'unsupported'; message: string }
  | { state: 'missing'; totalBytes: number }
  | { state: 'verifying'; totalBytes: number }
  | { state: 'ready'; totalBytes: number }
  | { state: 'failed'; reason: SpeechModelFailure; message: string; totalBytes: number };

export interface SpeechStatus {
  /** False on platforms the runtime is not staged for (see MOBILE PORT NOTE). */
  supported: boolean;
  model: SpeechModelStatus;
  microphone: SpeechMicrophoneAccess;
  engine: 'stopped' | 'starting' | 'ready' | 'failed';
  activeSessionId: string | null;
}

export type SpeechEndReason =
  | 'stopped' | 'cancelled' | 'silence' | 'limit' | 'hidden' | 'private' | 'replaced' | 'error';

/** What happened to the system clipboard when a dictation finished. */
export type SpeechClipboardOutcome =
  | { state: 'off' }
  | { state: 'empty' }
  /** The words are on the clipboard. restorable: the previous text can still be put back. */
  | { state: 'kept'; restorable: boolean }
  /** Something other than text (an image, files) was on the clipboard, so it was left alone. */
  | { state: 'left_alone'; reason: 'other_content' | 'too_large' }
  | { state: 'failed' };

export type SpeechErrorCode =
  | 'unsupported' | 'model_missing' | 'model_busy' | 'public_surface' | 'busy_session' | 'engine_failed'
  | 'engine_overloaded' | 'invalid_audio';

export type SpeechEvent =
  | { type: 'status'; status: SpeechStatus }
  /** The private surface went away: clear local notices and release the microphone now. */
  | { type: 'reset' }
  /** The recognizer finished loading; audio queued so far is being processed. */
  | { type: 'ready'; sessionId: string }
  /** Someone is (or stopped) speaking, as the voice detector hears it. */
  | { type: 'speech'; sessionId: string; speaking: boolean }
  /** Best guess so far for one spoken stretch; a later partial/final for the same segment replaces it. */
  | { type: 'partial'; sessionId: string; segmentId: number; text: string }
  | { type: 'final'; sessionId: string; segmentId: number; text: string }
  /** The stretch turned out not to be speech: remove its tentative text. */
  | { type: 'discard'; sessionId: string; segmentId: number }
  | { type: 'ended'; sessionId: string; reason: SpeechEndReason; transcript: string; clipboard: SpeechClipboardOutcome }
  | { type: 'error'; sessionId?: string; code: SpeechErrorCode; message: string };

export interface SpeechStartReceipt { sessionId: string; sampleRate: typeof SPEECH_AUDIO.sampleRate; engine: 'loading' | 'ready' }
/** Start never throws across the bridge: a refusal says why in words the person can act on. */
export type SpeechStartResult = ({ ok: true } & SpeechStartReceipt) | { ok: false; code: SpeechErrorCode; message: string };
export interface SpeechEndReceipt { sessionId: string; reason: SpeechEndReason; transcript: string; clipboard: SpeechClipboardOutcome }

const sessionId = z.string().min(1).max(80);
export const speechStartInput = z.object({
  language: z.enum(SPEECH_LANGUAGES),
  /** Keep the finished words on the clipboard (the previous text stays restorable). */
  keepInClipboard: z.boolean(),
}).strict();
export const speechSessionInput = z.object({ sessionId }).strict();
export type SpeechStartInput = z.infer<typeof speechStartInput>;
export type SpeechSessionInput = z.infer<typeof speechSessionInput>;

export interface SpeechBridge {
  speechStatus(): Promise<SpeechStatus>;
  speechStart(input: SpeechStartInput): Promise<SpeechStartResult>;
  /** Fire-and-forget: 16 kHz mono float samples, numbered from 0 within a session. */
  speechAudio(sessionId: string, sequence: number, samples: Float32Array): void;
  speechStop(input: SpeechSessionInput): Promise<SpeechEndReceipt>;
  speechCancel(input: SpeechSessionInput): Promise<void>;
  /** Put the clipboard back the way it was before the last dictation, if nothing else was copied since. */
  speechRestoreClipboard(): Promise<{ restored: boolean }>;
  speechOpenMicrophoneSettings(): Promise<void>;
  onSpeech(callback: (event: SpeechEvent) => void): () => void;
}

/** One place for the words people read, so the two sides never disagree. */
export const SPEECH_MESSAGES = Object.freeze({
  unsupported: '这台设备暂时还不能用语音输入。',
  model_missing: '随软件提供的语音文件不完整，请修复安装后重试。',
  model_busy: '识别模型正在准备，稍等一下再试。',
  public_surface: '现在是公开展示，语音输入先关着。',
  busy_session: '另一段语音还在听，先把它结束吧。',
  engine_failed: '语音识别没能启动，请再试一次。',
  engine_overloaded: '电脑这会儿有点忙，语音跟不上了，已经先停下，写好的字都留着。',
  invalid_audio: '麦克风的声音没有传过来，换个麦克风或再试一次。',
  integrity_failed: '随软件提供的语音文件已损坏，请修复安装后重试。',
  microphone_denied: 'Windows 没有允许在场使用麦克风。在“隐私和安全性 > 麦克风”里打开后再试。',
  microphone_missing: '没有找到可用的麦克风。',
  microphone_busy: '麦克风正被别的程序占用。',
  nothing_heard: '没有听到声音，麦克风是不是静音了？',
  field_full: '这里已经写满了，没法再放进更多字。',
  field_locked: '这里现在不能写字，语音先停下了。',
} as const);
export type SpeechMessageKey = keyof typeof SPEECH_MESSAGES;
