import { ArrowUp, Square } from 'lucide-react';
import './composer-actions.css';

export interface ComposerActionsProps {
  busy: boolean;
  submitting: boolean;
  hasDraft: boolean;
  onStop: () => void;
}

/** The same composer keeps both choices available: stop this reply, or send
 * the words already being written so the conversation can follow them. */
export function ComposerActions({ busy, submitting, hasDraft, onStop }: ComposerActionsProps) {
  return <>
    {busy && <button
      className="send-button stop"
      type="button"
      title="停止回复 · Esc"
      aria-label="停止回复"
      onClick={onStop}
    ><Square size={13} fill="currentColor" /></button>}
    {(!busy || hasDraft) && <button
      className={`send-button${busy ? ' composer-supplement' : ''}`}
      type="submit"
      aria-label={busy ? '发送补充，按这段话继续' : '发送'}
      title={busy ? '按这段话接着聊 · Enter' : '发送 · Enter'}
      disabled={submitting || !hasDraft}
    >{busy ? '补一句' : <ArrowUp size={22} />}</button>}
  </>;
}
