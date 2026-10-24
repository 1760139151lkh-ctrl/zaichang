import { useEffect, useId, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { Bridge } from '../shared/types';
import type { TiyiConnectorState } from '../shared/tiyi';
import './tiyi-connection.css';

const api = window.zaichang;
type ConnectionCheck = Awaited<ReturnType<Bridge['tiyiConnect']>>['check'];
type ConnectionReply = TiyiConnectorState & { check?: ConnectionCheck };
type Operation = 'status' | 'direct' | 'webvpn' | 'gateway' | 'disconnect';
export type TiyiConnectionFocus = 'primary' | 'direct' | 'webvpn' | 'gateway' | 'disconnect' | 'account-login';

const connectionFailure = '这次体艺连接没有完成，可以重新检查。';
function checkMessage(check: ConnectionCheck, via: 'direct' | 'webvpn', state?: TiyiConnectorState) {
  if (check.status === 'fresh') return '体艺登录可用。记录会按你的问题再读取。';
  if (check.status === 'auth_required') {
    if (via === 'webvpn') return state?.gateway?.windowOpen
      ? '校方连接窗口已打开，完成登录后，再回到这里检查。'
      : '还需要在校方页面完成登录，再回来检查。';
    return '还需要完成体艺登录，可以先在校园资料里登录浙大，再检查一次。';
  }
  if (check.status === 'saved') return '这次没有取得新的校方回复，可以再检查。';
  if (check.status === 'partial') return '这次还没有完整确认体艺登录，可以再检查。';
  // The native owner supplies fixed safe prose; it does not relay upstream account messages.
  return check.reason || '学校这次没有完整回应，可以稍后再检查。';
}
function gatewayMessage(state?: TiyiConnectorState) {
  switch (state?.gateway?.gatewayStatus) {
    case 'authenticated': return '在场保存的学校 WebVPN 会话可用。';
    case 'login_required': return state?.campusReadAllowed === false
      ? '在场的学校 WebVPN 会话尚未登录。' : '在场的学校 WebVPN 会话需要登录。';
    case 'unavailable': return state?.gateway?.reason || '暂时无法确认在场保存的学校 WebVPN 会话。';
    default: return '暂时没有取得本产品的学校 WebVPN 会话状态。';
  }
}
function checkedTime(value: string) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString('zh-CN', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }) : undefined;
}

export function TiyiConnection({ disabled = false, restoreFocus, onControlFocus }: {
  disabled?: boolean;
  restoreFocus?: TiyiConnectionFocus;
  onControlFocus?: (focus: TiyiConnectionFocus) => void;
}) {
  const titleId = useId();
  const [connection, setConnection] = useState<TiyiConnectorState>();
  const [check, setCheck] = useState<{ via: 'direct' | 'webvpn'; value: ConnectionCheck }>();
  const [pending, setPending] = useState<Operation | ''>('status');
  const [error, setError] = useState('');
  const [stopped, setStopped] = useState(false);
  const [gatewayChecked, setGatewayChecked] = useState(false);
  const alive = useRef(true);
  const version = useRef(0);
  const running = useRef<Operation | ''>('status');
  const activeControl = useRef<TiyiConnectionFocus | undefined>(undefined);
  const controls = useRef<Partial<Record<TiyiConnectionFocus, HTMLButtonElement>>>({});
  const alternatives = useRef<HTMLDetailsElement>(null);
  const focusOnMount = useRef(restoreFocus);
  const locked = disabled || !!pending;
  const campusReadClosed = connection?.campusReadAllowed === false;
  const connectionLocked = locked || campusReadClosed;
  const campusPermissionId = `${titleId}-campus-permission`;
  const via = connection?.via || 'direct';

  useEffect(() => {
    alive.current = true;
    const request = ++version.current;
    void api.tiyiStatus().then(value => {
      if (alive.current && request === version.current) setConnection(value);
    }).catch(() => {
      if (alive.current && request === version.current) setError(connectionFailure);
    }).finally(() => {
      if (alive.current && request === version.current) { running.current = ''; setPending(''); }
    });
    return () => { alive.current = false; version.current++; };
  }, []);
  useEffect(() => {
    let frame = 0;
    const restore = () => {
      const target = focusOnMount.current;
      if (!target || pending || disabled) return;
      if (target === 'direct' || target === 'webvpn' || target === 'gateway' || target === 'account-login') {
        if (alternatives.current) alternatives.current.open = true;
      }
      const preferred = controls.current[target];
      const button = preferred && !preferred.disabled ? preferred
        : campusReadClosed ? controls.current.disconnect : controls.current.webvpn;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!alive.current || !button?.isConnected || button.disabled || !document.hasFocus()) return;
        button.scrollIntoView({ block: 'nearest', behavior: 'instant' });
        button.focus({ preventScroll: true });
        focusOnMount.current = undefined;
      });
    };
    restore();
    window.addEventListener('focus', restore);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('focus', restore); };
  }, [pending, disabled, campusReadClosed]);

  async function perform(kind: Operation, action: () => Promise<ConnectionReply>, opener: HTMLButtonElement, focus?: TiyiConnectionFocus) {
    if (running.current && kind !== 'disconnect' || running.current === 'disconnect') return;
    if ((kind === 'direct' || kind === 'webvpn') && campusReadClosed) return;
    if (kind !== 'status') { activeControl.current = focus || kind; onControlFocus?.(activeControl.current); }
    const request = ++version.current;
    running.current = kind; setPending(kind); setError('');
    if (kind === 'direct' || kind === 'webvpn' || kind === 'disconnect') { setCheck(undefined); setStopped(false); }
    try {
      const value = await action();
      if (!alive.current || request !== version.current) return;
      setConnection(value);
      if ((kind === 'direct' || kind === 'webvpn') && value.check) setCheck({ via: kind, value: value.check });
      if (kind === 'gateway') setGatewayChecked(true);
      if (kind === 'disconnect') { setStopped(true); setGatewayChecked(false); }
    } catch {
      if (alive.current && request === version.current) {
        setError(kind === 'disconnect' ? '体艺连接是否已停止还不能确认，请重试停止。'
          : kind === 'gateway' ? '暂时不能确认在场保存的学校 WebVPN 会话，可以再检查。' : connectionFailure);
        if (kind === 'direct' || kind === 'webvpn') {
          try {
            const current = await api.tiyiStatus();
            if (alive.current && request === version.current) setConnection(current);
          } catch { /* A failed check never invents a different saved connection choice. */ }
        }
      }
    } finally {
      if (alive.current && request === version.current) {
        running.current = ''; setPending('');
        requestAnimationFrame(() => { if (alive.current && document.hasFocus() && opener.isConnected && !opener.disabled) opener.focus({ preventScroll: true }); });
      }
    }
  }

  const webvpnNeedsLogin = !campusReadClosed && check?.via === 'webvpn' && check.value.status === 'auth_required';
  const observedAt = check && checkedTime(check.value.observedAt);
  const readingClosed = stopped || connection?.readAllowed === false;
  return <section className="tiyi-connection" aria-labelledby={titleId} aria-busy={!!pending}>
    <div className="tiyi-connection-main">
      <h3 id={titleId}>浙大体艺</h3>
      <button ref={button => { controls.current.primary = button || undefined; }} type="button" className="primary-button" disabled={connectionLocked} aria-describedby={campusReadClosed ? campusPermissionId : undefined} onFocus={() => onControlFocus?.('primary')} onClick={event => void perform(via, () => api.tiyiConnect({ via }), event.currentTarget, 'primary')}>
        {pending === 'status' ? '正在读取…' : (pending === 'direct' || pending === 'webvpn') && activeControl.current === 'primary' ? '正在检查…' : '检查体艺连接'}
      </button>
    </div>
    {campusReadClosed && <p id={campusPermissionId} className="tiyi-connection-feedback" role="status">校园资料的读取已关闭。请先开启本页“需要时，帮我看看校园资料”，再检查体艺连接。</p>}
    {error && <p className="tiyi-connection-feedback" role="alert">{error}</p>}
    {!error && !check && !pending && readingClosed && !campusReadClosed && <p className="tiyi-connection-feedback" role="status">体艺资料的读取已关闭。检查连接后可以重新开启；不会注销外部浏览器中的登录。</p>}
    {!error && !check && !pending && !readingClosed && !campusReadClosed && connection?.readAllowed === true && <p className="tiyi-connection-feedback" role="status">已允许在场按需读取体艺资料。</p>}
    {!error && !stopped && !campusReadClosed && check && <div className="tiyi-connection-feedback" role="status">
      <p>{checkMessage(check.value, check.via, connection)}</p>
      {observedAt && <small>上次检查：<time dateTime={check.value.observedAt}>{observedAt}</time></small>}
    </div>}
    {!error && !check && !readingClosed && !campusReadClosed && !pending && connection && !connection.configured && <p className="tiyi-connection-feedback">这台电脑暂时无法打开体艺连接。</p>}
    <details ref={alternatives} className="tiyi-connection-alternatives">
      <summary>其他连接方式</summary>
      <div className="tiyi-connection-alternative-actions">
        <button ref={button => { controls.current.direct = button || undefined; }} type="button" className="subtle-button" disabled={connectionLocked} aria-describedby={campusReadClosed ? campusPermissionId : undefined} onFocus={() => onControlFocus?.('direct')} onClick={event => void perform('direct', () => api.tiyiConnect({ via: 'direct' }), event.currentTarget)}>
          {pending === 'direct' && activeControl.current === 'direct' ? '正在检查…' : '使用直接连接'}
        </button>
        <button ref={button => { controls.current.webvpn = button || undefined; }} type="button" className="subtle-button" disabled={connectionLocked} aria-describedby={campusReadClosed ? campusPermissionId : undefined} onFocus={() => onControlFocus?.('webvpn')} onClick={event => void perform('webvpn', () => api.tiyiConnect({ via: 'webvpn' }), event.currentTarget)}>
          {pending === 'webvpn' && activeControl.current === 'webvpn' ? '正在检查…' : webvpnNeedsLogin ? '登录后继续检查' : '通过学校 WebVPN 连接'}
        </button>
        {webvpnNeedsLogin && connection?.gateway?.gatewayAuthenticated && <button ref={button => { controls.current['account-login'] = button || undefined; }} type="button" className="text-button" disabled={locked} onFocus={() => onControlFocus?.('account-login')} onClick={event => void perform('webvpn', () => api.tiyiConnect({ via: 'webvpn', accountLogin: true }), event.currentTarget, 'account-login')}>
          {pending === 'webvpn' && activeControl.current === 'account-login' ? '正在打开…' : '打开体艺登录窗口'} <ExternalLink size={13} />
        </button>}
        <button ref={button => { controls.current.gateway = button || undefined; }} type="button" className="text-button" disabled={locked} onFocus={() => onControlFocus?.('gateway')} onClick={event => void perform('gateway', () => api.tiyiStatus({ refreshGateway: true }), event.currentTarget)}>
          {pending === 'gateway' ? '正在检查学校会话…' : '检查学校登录'}
        </button>
      </div>
      {gatewayChecked && <p className="tiyi-connection-feedback" role="status">{gatewayMessage(connection)}</p>}
      {connection && <p className="tiyi-connection-school-note">当前方式：{via === 'webvpn' ? '学校 WebVPN' : '直接连接'}。{!campusReadClosed && '需要登录时，会打开在场独立的校方连接窗口。'}</p>}
    </details>
    <button ref={button => { controls.current.disconnect = button || undefined; }} type="button" className="text-button tiyi-connection-stop" disabled={pending === 'disconnect'} onFocus={() => onControlFocus?.('disconnect')} onClick={event => void perform('disconnect', () => api.tiyiDisconnect(), event.currentTarget)}>
      {pending === 'disconnect' ? '正在停止…' : '停止体艺连接'}
    </button>
  </section>;
}
