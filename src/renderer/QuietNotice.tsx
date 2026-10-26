import { X } from 'lucide-react';
import './quiet-notice.css';

export interface QuietNoticeProps {
  /** A human explanation from uiError or the owning workflow, never a stack. */
  message: string;
  action?: { label: string; onClick: () => void; disabled?: boolean };
  onDismiss?: () => void;
  tone?: 'status' | 'problem';
  className?: string;
}

/** Local feedback only. The original owner decides what can be retried or
 * reconciled; this component neither saves nor repeats a request. */
export function QuietNotice({ message, action, onDismiss, tone = 'problem', className = '' }: QuietNoticeProps) {
  if (!message) return null;
  return <aside className={`quiet-notice ${className}`} data-tone={tone} role="status" aria-live="polite" aria-atomic="true">
    <p className="quiet-notice-message">{message}</p>
    {action && <button type="button" className="quiet-notice-action" onClick={action.onClick} disabled={action.disabled}>{action.label}</button>}
    {onDismiss && <button type="button" className="quiet-notice-dismiss" aria-label="收起提示" onClick={onDismiss}><X size={14} aria-hidden="true" /></button>}
  </aside>;
}
