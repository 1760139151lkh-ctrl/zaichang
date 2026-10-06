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

export function uiError(error: unknown) {
  return String(error instanceof Error ? error.message : error)
    .replace(/^Error invoking remote method '[^']+':\s*/, '')
    .replace(/^(?:(?:Harness|Type|Range|Syntax)?Error:\s*)+/, '');
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
