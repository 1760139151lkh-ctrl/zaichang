import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X, Minus, Square } from 'lucide-react';

export function WindowControls({ onClose }: { onClose: () => void }) {
  return (
    <div className="window-controls" aria-label="窗口控制">
      <IconButton label="最小化" onClick={() => window.zaichang.window('minimize')}>
        <Minus size={14} />
      </IconButton>
      <IconButton label="最大化或还原" onClick={() => window.zaichang.window('maximize')}>
        <Square size={12} />
      </IconButton>
      <IconButton label="关闭在场" className="window-close" onClick={onClose}>
        <X size={16} />
      </IconButton>
    </div>
  );
}

export interface UiErrorOptions {
  operation?: 'open' | 'save' | 'send';
  /** Use only facts known by the caller; this helper cannot know draft or delivery state. */
  fallback?: string;
}

/** Project an error into the existing local notice, keeping its diagnostic out
 * of the reading surface. Business explanations remain the owner's words. */
export function uiError(error: unknown, { operation, fallback }: UiErrorOptions = {}) {
  const details = error && typeof error === 'object' ? error as { message?: unknown; name?: unknown; code?: unknown } : undefined;
  const raw = typeof details?.message === 'string' ? details.message : typeof error === 'string' ? error : '';
  const message = raw.trim()
    .replace(/^(?:Error invoking remote method '[^']+':\s*)+/, '')
    .replace(/^(?:(?:Harness|Reference|Type|Range|Syntax|Eval|URI|Aggregate)?Error:\s*)+/, '');
  const explanation = message.split(/\r?\n(?=\s*at\s+\S+)/, 1)[0].trim();
  const diagnostic = `${typeof details?.name === 'string' ? details.name : ''} ${typeof details?.code === 'string' ? details.code : ''} ${message}`;
  if (/\b(?:InteractiveProgramValueError|interactive_state_invalid)\b/.test(diagnostic)
    || /局部字段「[^」]+」不符合当前声明的范围/.test(explanation)) {
    console.error('[在场] 操作异常', error);
    return '这次的调整超出了当前范围，可以按控件给出的范围再试。';
  }
  const technical = /\b(?:is not defined|is not a function|Cannot (?:read|set|access|convert)|undefined is not|Maximum call stack|Unexpected token|Objects are not valid as a React child|Invalid hook call|Minified React error|SQLITE_\w+|ERR_[A-Z_]+|E[A-Z]{3,})\b|(?:[A-Za-z]:[\\/]|file:\/\/|node_modules[\\/])/.test(explanation)
    || /^\s*[\[{]/.test(explanation)
    || /\b(?:ZodError|invalid_type|invalid_union|unrecognized_keys|invalid_arguments|too_small|too_big)\b/.test(diagnostic)
    || /\b(?:materials|notes|agenda|presentation|memory|calendar|runtime|harness)\.[a-z][a-z_]+\b/.test(explanation)
    || /\b(?:expectedRevision|providedEvidenceIds|sourceBoundary|privacyEpoch|policyRevision|resourceId|sessionId|messageId)\s*[:=]/.test(explanation);
  // A Chinese owner explanation can contain names such as PDF or a specific
  // action state. Do not flatten it into a generic network/save failure.
  if (/[\u3400-\u9fff]/.test(explanation) && !technical) {
    if (explanation !== message) console.error('[在场] 操作异常', error);
    return explanation;
  }

  console.error('[在场] 操作异常', error);
  const unconfirmed = operation === 'send'
    ? '这次发送还没有确认。请先查看对话里的结果，再决定下一步。'
    : operation === 'save' ? '这次保存还没有确认。请先核对当前内容。' : undefined;
  if (/\b(?:TimeoutError|ETIMEDOUT|ESOCKETTIMEDOUT|timed?\s*out|timeout)\b/i.test(diagnostic))
    return unconfirmed || '等了一会儿，还没有收到结果。请先看看当前状态。';
  if (/\b(?:NetworkError|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|ERR_NETWORK|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED)\b|failed to fetch|fetch failed|network request failed|net::/i.test(diagnostic))
    return unconfirmed || '暂时连不上。可以先检查网络，再回来看看。';
  if (/\b(?:ENOENT|NotFoundError)\b|\b(?:HTTP\s*|status(?:code)?\s*[:=]?\s*)404\b/i.test(diagnostic))
    return '这份内容现在找不到了。可以回到原来的位置重新打开。';
  if (/\b(?:EACCES|EPERM|NotAllowedError|SecurityError)\b|permission denied|access denied/i.test(diagnostic))
    return '这次没有取得访问权限。请先检查这份内容的访问设置。';
  if (/\b(?:QuotaExceededError|ENOSPC)\b|disk (?:is )?full/i.test(diagnostic))
    return '设备的可用空间不足。请先腾出一些空间，再核对保存结果。';
  if (/\bAbortError\b|\b(?:operation|request) (?:was )?aborted\b/i.test(diagnostic))
    return unconfirmed || '刚才这一步已经停下。';
  if (/\b(?:401|403)\b|invalid api key|unauthorized|authentication failed/i.test(diagnostic))
    return '当前连接没有通过验证。可以到连接设置里检查。';
  if (/\b429\b|rate limit|too many requests/i.test(diagnostic))
    return unconfirmed || '连接这会儿有些忙，暂时没能接上。';
  if (/insufficient (?:balance|credits|quota)|billing|payment required|\b402\b/i.test(diagnostic))
    return '当前连接的可用额度不足。可以到服务提供方查看用量。';
  if (/\b(?:source_missing|source_unavailable|source_deleted|resource_expired)\b/i.test(diagnostic))
    return '原来的内容这会儿读不到。可以回到原出处，重新选择。';
  if (/\b(?:revision_conflict|source_changed|dependency_changed|approval_mismatch)\b/i.test(diagnostic))
    return '这份内容后来有了变化。请先看看现在这一版，再决定怎么继续。';
  if (fallback) return fallback;
  return unconfirmed || (operation === 'open' ? '这次没能打开。可以回到原来的入口再看看。' : '刚才这一步出了问题，暂时没能完成。');
}

export function Portal({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg aria-hidden="true" className={className} width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M8 26V11a8 8 0 0 1 16 0v15" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" />
      <path
        d="M13 26V12.3a3.1 3.1 0 0 1 3.1-3.1H24M8 26h16"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
      />
      <circle cx="19.2" cy="18.3" r="1.1" fill="currentColor" />
    </svg>
  );
}
export function PagePanel({
  title,
  eyebrow,
  children,
  onClose,
  className = '',
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <section className={`page-panel ${className}`}>
      <div className="page-content">
        <header className="page-heading">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h1 ref={ref} tabIndex={-1}>
              {title}
            </h1>
          </div>
          <button className="text-button page-return" onClick={onClose}>
            回到对话
          </button>
        </header>
        {children}
      </div>
    </section>
  );
}
export function IconButton({
  label,
  children,
  onClick,
  className = '',
  disabled = false,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
export function Modal({
  title,
  children,
  onClose,
  className = '',
  fallbackFocus,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  fallbackFocus?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closing = useRef(false);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (opener?.isConnected && opener !== document.body && !opener.hasAttribute('disabled'))
        opener.focus({ preventScroll: true });
      else fallbackFocus?.();
    };
  }, []);
  function close() {
    if (closing.current) return;
    closing.current = true;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onClose();
      return;
    }
    ref.current?.classList.add('closing');
    const animation = ref.current?.animate(
      [
        { opacity: 1, transform: 'translateY(0) scale(1)' },
        { opacity: 0, transform: 'translateY(6px) scale(.985)' },
      ],
      { duration: 150, easing: 'cubic-bezier(.3,0,.7,1)', fill: 'forwards' },
    );
    if (animation) void animation.finished.then(onClose).catch(onClose);
    else onClose();
  }
  return (
    <dialog
      ref={ref}
      className={`panel ${className}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close();
        }
      }}
    >
      <div className="panel-head">
        <h2 id={titleId}>{title}</h2>
        <IconButton label="关闭面板" onClick={close}>
          <X size={19} />
        </IconButton>
      </div>
      {children}
    </dialog>
  );
}
export function Switch({
  checked,
  onChange,
  label,
  detail,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  detail?: string;
  disabled?: boolean;
}) {
  return (
    <div className="switch-row">
      <div>
        <span>{label}</span>
        {detail && <p>{detail}</p>}
      </div>
      <button
        className="switch"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        disabled={disabled}
      >
        <span />
      </button>
    </div>
  );
}
