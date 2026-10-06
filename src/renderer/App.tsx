import { Portal, IconButton, Modal, WindowControls, uiError } from './ui';
import { SettingsPanel, type SettingsDraft } from './SettingsPanel';
import { AgendaView, type WorkspaceView } from './Workspace';
import { Navigation } from './Navigation';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  ArrowUp,
  ArrowDown,
  Plus,
  X,
  Minus,
  Square,
  History,
  ChevronDown,
  ChevronRight,
  CalendarDays,
  Check,
  LoaderCircle,
  CircleAlert,
  RotateCcw,
  Copy,
  Trash2,
  Search,
  ArrowUpRight,
  FileText,
  Paperclip,
  Image as ImageIcon,
  Monitor,
  Quote,
  Pencil,
} from 'lucide-react';
import { RichText } from './RichText';
import { DEFAULT_TIME_ZONE, formatDateTime, fromTimeInput, timeZoneLabel, toTimeInput } from './time';
import {
  DisplayReview,
  MatterCard,
  PreparationShelf,
  PublicDisplay,
  type MatterInteraction,
  type MatterInteractionUpdate,
} from './LifePanels';
import type { SharedMatterView, SurfaceView } from '../shared/presentation';
import type { Action, Draft, Memory, Message, ReleaseArtifact, State } from '../shared/types';
import { LIMITS } from '../shared/limits';
import { emptyRoute, type MapRouteResult } from '../shared/map-v2';
import { MapRouteCard, MapSheet } from './map/CampusMap';
import {
  ReplyEvidence,
  ScopeSettings,
  FeedbackControl,
  needName,
  emptyMemoryWorkspace,
  type TurnControls,
} from './HarnessViews';

const api = window.zaichang;
type Panel = 'history' | null;
type ActionResult = { ok: boolean; error?: string };
const formatDate = formatDateTime;
function errorText(error: unknown) {
  return uiError(error);
}

export function App() {
  const [state, setState] = useState<State | null>(null);
  const boundaryRevision = useRef('');
  const [turnControls, setTurnControls] = useState<TurnControls>({});
  const turnControlsRef = useRef<TurnControls>({});
  const [scopeOpen, setScopeOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string>();
  const sessionRef = useRef<string | undefined>(undefined);
  const [input, setInput] = useState('');
  const [attachment, setAttachment] = useState<Draft['attachment']>(null);
  const draftRef = useRef<Draft>({ text: '', attachment: null }),
    draftKey = useRef('new'),
    draftRevision = useRef(0),
    navigation = useRef(0);
  const settingsDraft = useRef<SettingsDraft>({});
  const [memoryWorkspace, setMemoryWorkspace] = useState(emptyMemoryWorkspace);
  const [draftReady, setDraftReady] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0),
    [loadError, setLoadError] = useState('');
  const [attachmentMenu, setAttachmentMenu] = useState(false);
  const attachmentMenuRef = useRef<HTMLDivElement>(null);
  const [attachmentMenuPosition, setAttachmentMenuPosition] = useState<CSSProperties>({});
  const attachmentControl = useRef<HTMLDivElement>(null),
    attachmentTrigger = useRef<HTMLButtonElement>(null);
  const knownMemories = useRef(new Set<string>()),
    activeRun = useRef(false);
  const [memoryNotice, setMemoryNotice] = useState<Memory | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [view, setView] = useState<WorkspaceView>('chat');
  const viewRef = useRef(view);
  viewRef.current = view;
  const [matterInteractions, setMatterInteractions] = useState<Record<string, MatterInteraction>>({});
  const interactionEpoch = state?.privacyEpoch;
  function updateMatterInteraction(id: string, value: MatterInteractionUpdate) {
    if (boundaryRevision.current.split(':')[0] !== String(interactionEpoch)) return;
    setMatterInteractions((current) => ({
      ...current,
      [id]: typeof value === 'function' ? value(current[id] || {}) : value,
    }));
  }
  const [draftSaved, setDraftSaved] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [closingDrafts, setClosingDrafts] =
    useState<
      (Awaited<ReturnType<typeof api.unsavedDrafts>>[number] & { text: string; attachmentName?: string })[]
    >();
  const [closeError, setCloseError] = useState('');
  const closePending = useRef(false);
  const requestCloseRef = useRef<() => Promise<void>>(async () => {});
  const [toast, setToast] = useState('');
  const [starting, setStarting] = useState(false);
  const [navigating, setNavigating] = useState(false),
    navigationPending = useRef(false);
  const [away, setAway] = useState(false);
  const [mapSheet, setMapSheet] = useState<MapRouteResult | null>(null);
  const [displayReview, setDisplayReview] = useState<SurfaceView>();
  const surfaceMode = useRef<'private' | 'public'>('private');
  const surfaceRevision = useRef(0);
  const [publicCloseNotice, setPublicCloseNotice] = useState('');
  const [sharedMapContext, setSharedMapContext] = useState<{ label: string; expiresAt: string }>();
  const privateReturn = useRef<{ sessionId?: string; view: WorkspaceView }>({ view: 'chat' });
  const [previewImage, setPreviewImage] = useState<Message['image']>();
  const scrollRef = useRef<HTMLDivElement>(null),
    inputRef = useRef<HTMLTextAreaElement>(null),
    followRef = useRef(true);
  const readingAnchor = useRef<{ element: HTMLElement; offset: number } | undefined>(undefined);
  function rememberReadingPosition() {
    const viewport = scrollRef.current;
    if (!viewport || !viewport.clientHeight || followRef.current) return;
    const top = viewport.getBoundingClientRect().top;
    const element = [
      ...viewport.querySelectorAll<HTMLElement>(
        '.markdown > p, .markdown > h2, .markdown > h3, .markdown > blockquote',
      ),
    ].find((element) => element.getBoundingClientRect().bottom > top + 20);
    if (element) readingAnchor.current = { element, offset: element.getBoundingClientRect().top - top };
  }
  const busy = starting || messages.some((m) => m.status === 'running');
  const empty = messages.length === 0;
  const lunaSubstitute = state?.modelRuntime?.temporaryTestSubstitute === true;
  const modelLabel =
    state?.settings.mode === 'demo' ? '本地示例' : lunaSubstitute ? 'Luna 临时代测' : 'DeepSeek';
  function useSuggestion(text: string) {
    setView('chat');
    if (draftRef.current.text.trim()) {
      notify('输入框里还有草稿，已为你保留。可以接着补充。');
      inputRef.current?.focus();
      return;
    }
    replaceDraft({ ...draftRef.current, text });
    requestAnimationFrame(() => inputRef.current?.focus());
  }
  function notify(message: string) {
    setToast(message);
  }
  async function attempt<T>(fn: () => Promise<T>): Promise<T | undefined> {
    try {
      return await fn();
    } catch (e) {
      notify(errorText(e));
    }
  }
  function updateState(next: State) {
    if (next.presentation && next.presentation.revision < surfaceRevision.current) return;
    // A private IPC response may arrive after a newer privacy/permission event.
    // It must not roll the boundary back and make old UI work valid again.
    if (next.presentation?.mode !== 'public' && boundaryRevision.current) {
      const [epoch, policy] = boundaryRevision.current.split(':').map(Number);
      if (
        typeof next.privacyEpoch === 'number' &&
        (next.privacyEpoch < epoch || (next.privacyEpoch === epoch && (next.policyRevision ?? 0) < policy))
      )
        return;
    }
    if (next.presentation) surfaceRevision.current = next.presentation.revision;
    if (next.presentation?.mode === 'public') {
      if (surfaceMode.current !== 'public')
        privateReturn.current = { sessionId: sessionRef.current, view: viewRef.current };
      surfaceMode.current = 'public';
      setMessages([]);
      setInput('');
      setAttachment(null);
      setMemoryNotice(null);
      setToast('');
      setSharedMapContext(undefined);
      setMapSheet(null);
      setPreviewImage(undefined);
      setPanel(null);
      setScopeOpen(false);
      setDisplayReview(undefined);
      setAttachmentMenu(false);
      setState(next);
      return;
    }
    surfaceMode.current = 'private';
    const revision = `${next.privacyEpoch}:${next.policyRevision}`;
    if (boundaryRevision.current && boundaryRevision.current.split(':')[0] !== String(next.privacyEpoch)) {
      settingsDraft.current = {};
      setMemoryWorkspace(emptyMemoryWorkspace());
      setMatterInteractions({});
    }
    if (boundaryRevision.current && revision !== boundaryRevision.current && sessionRef.current) {
      const selected = sessionRef.current;
      void api
        .messages(selected)
        .then((saved) => {
          if (
            selected !== sessionRef.current ||
            boundaryRevision.current !== revision ||
            surfaceMode.current === 'public'
          )
            return;
          setMessages((current) => current.map((m) => saved.find((s) => s.id === m.id) || m));
        })
        .catch(() => {});
      setMemoryNotice(null);
    }
    boundaryRevision.current = revision;
    knownMemories.current = new Set(next.memories.map((m) => m.id));
    setState(next);
  }
  function replaceDraft(next: Draft, persist = true) {
    draftRevision.current++;
    draftRef.current = next;
    setInput(next.text);
    setAttachment(next.attachment);
    setDraftSaved(false);
    if (persist)
      void attempt(() =>
        api.saveDraft({
          id: draftKey.current,
          draft: next,
          ...(turnControlsRef.current.retention === 'session_only'
            ? { retention: 'session_only' as const }
            : {}),
        }),
      );
  }
  async function saveCurrentDraft() {
    if (savingDraft || navigationPending.current) return;
    const revision = draftRevision.current,
      id = draftKey.current;
    setSavingDraft(true);
    await attempt(async () => {
      await api.saveDraft({ id, draft: draftRef.current });
      const info = await api.draftInfo(id);
      await api.persistDraft({ id, digest: info.digest, confirmed: true });
      if (revision === draftRevision.current) setDraftSaved(true);
    });
    setSavingDraft(false);
  }
  async function requestClose() {
    if (surfaceMode.current === 'public') {
      setPublicCloseNotice('请先结束展示，再关闭在场。未保存的草稿仍为你保留。');
      return;
    }
    if (closePending.current) return;
    closePending.current = true;
    try {
      const pending = await api.unsavedDrafts();
      if (!pending.length) {
        api.window('close');
        return;
      }
      const previews = await Promise.all(
        pending.map(async (item) => {
          const draft = await api.draft(item.id);
          return { ...item, text: draft.text, attachmentName: draft.attachment?.name };
        }),
      );
      setCloseError('');
      setClosingDrafts(previews);
    } catch (error) {
      notify(errorText(error));
    } finally {
      closePending.current = false;
    }
  }
  requestCloseRef.current = requestClose;
  useEffect(() => api?.onCloseRequest(() => void requestCloseRef.current()), []);
  function updateDraft(part: Partial<Draft>) {
    if (navigationPending.current) return;
    replaceDraft({ ...draftRef.current, ...part });
  }
  useEffect(() => {
    if (!api) {
      notify('请从桌面程序打开在场。');
      return;
    }
    setLoadError('');
    void (async () => {
      try {
        const next = await api.state();
        updateState(next);
        if (next.presentation?.mode === 'public') return;
        const [saved, info] = await Promise.all([api.draft('new'), api.draftInfo('new')]);
        if (!draftRevision.current) {
          replaceDraft(saved, false);
          setDraftSaved(info.persisted && !info.empty);
        }
        setDraftReady(true);
      } catch (error) {
        setLoadError(errorText(error));
      }
    })();
    return api.onEvent((event) => {
      if (event.type === 'conversations') {
        setState((current) => (current ? { ...current, conversations: event.conversations } : current));
        return;
      }
      if (event.type === 'state') {
        const added = event.state.memories.find((m) => !knownMemories.current.has(m.id));
        if (added && activeRun.current) setMemoryNotice(added);
        updateState(event.state);
        return;
      }
      if (!sessionRef.current) {
        sessionRef.current = event.message.sessionId;
        setSessionId(event.message.sessionId);
      }
      if (event.message.sessionId !== sessionRef.current) return;
      if (event.message.role === 'assistant') activeRun.current = event.message.status === 'running';
      setMessages((previous) => {
        const index = previous.findIndex((m) => m.id === event.message.id);
        return index < 0
          ? [...previous, event.message]
          : previous.map((m, i) => (i === index ? event.message : m));
      });
    });
  }, [loadAttempt]);
  useEffect(() => {
    if (view === 'chat')
      requestAnimationFrame(() => {
        inputRef.current?.focus({ preventScroll: true });
        const anchor = readingAnchor.current,
          viewport = scrollRef.current;
        if (!followRef.current && anchor?.element.isConnected && viewport)
          viewport.scrollTop +=
            anchor.element.getBoundingClientRect().top - viewport.getBoundingClientRect().top - anchor.offset;
      });
  }, [view]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(''), 2800);
      return () => clearTimeout(t);
    }
  }, [toast]);
  useEffect(() => {
    if (!sharedMapContext) return;
    const timeout = setTimeout(
      () => setSharedMapContext(undefined),
      Math.max(0, Date.parse(sharedMapContext.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timeout);
  }, [sharedMapContext]);
  useEffect(() => {
    if (!attachmentMenu) return;
    const close = (e: PointerEvent) => {
      if (!attachmentControl.current?.contains(e.target as Node)) setAttachmentMenu(false);
    };
    document.addEventListener('pointerdown', close);
    attachmentControl.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => document.removeEventListener('pointerdown', close);
  }, [attachmentMenu]);
  useLayoutEffect(() => {
    if (!attachmentMenu) return;
    const place = () => {
      const trigger = attachmentTrigger.current,
        menu = attachmentMenuRef.current;
      if (!trigger || !menu) return;
      const anchor = trigger.getBoundingClientRect(),
        bounds = menu.getBoundingClientRect();
      const margin = 12,
        width = Math.min(238, window.innerWidth - margin * 2);
      const height = Math.min(bounds.height, window.innerHeight - margin * 2);
      const above = anchor.top - height - 8;
      setAttachmentMenuPosition({
        position: 'fixed',
        width,
        left: Math.max(margin, Math.min(anchor.left, window.innerWidth - width - margin)),
        top: Math.max(
          margin,
          Math.min(above >= margin ? above : anchor.bottom + 8, window.innerHeight - height - margin),
        ),
        bottom: 'auto',
        maxHeight: window.innerHeight - margin * 2,
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [attachmentMenu]);
  useEffect(() => {
    if (followRef.current) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);
  useLayoutEffect(() => {
    const el = inputRef.current;
    const resize = () => {
      if (!el?.isConnected) return;
      const scrollTop = el.scrollTop;
      const caretAtEnd = document.activeElement === el && el.selectionStart === el.value.length;
      el.style.height = 'auto';
      const available = Math.max(44, Math.min(180, window.innerHeight * 0.28));
      el.style.height = Math.min(el.scrollHeight, available) + 'px';
      el.scrollTop = caretAtEnd ? el.scrollHeight : scrollTop;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [input, view]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (surfaceMode.current === 'public') return;
      if (mapSheet) return;
      if (document.querySelector('dialog[open]')) return;
      if (e.isComposing || e.keyCode === 229) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'k' && (!panel || panel === 'history')) {
        e.preventDefault();
        setPanel((p) => (p === 'history' ? null : 'history'));
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'n' && !panel) {
        e.preventDefault();
        if (!busy) void newChat();
      }
      if (e.key === 'Escape' && attachmentMenu) {
        setAttachmentMenu(false);
        attachmentTrigger.current?.focus();
        return;
      }
      if (e.key === 'Escape' && view !== 'chat') {
        setView('chat');
        return;
      }
      if (e.key === 'Escape' && busy && !panel) void api.stop();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [busy, panel, attachmentMenu, mapSheet, view]);
  async function newChat() {
    if (busy || navigationPending.current) return;
    navigationPending.current = true;
    setNavigating(true);
    const token = ++navigation.current;
    setToast('');
    setMemoryNotice(null);
    setAttachmentMenu(false);
    try {
      await attempt(async () => {
        if (sharedMapContext) {
          await api.shareMapContext({ enabled: false });
          setSharedMapContext(undefined);
        }
        if (sessionRef.current) updateState(await api.endConversation(sessionRef.current));
        const saved = await api.draft('new');
        if (token !== navigation.current) return;
        draftKey.current = 'new';
        replaceDraft(saved, false);
        sessionRef.current = undefined;
        setSessionId(undefined);
        setMessages([]);
        setPanel(null);
        setView('chat');
        followRef.current = true;
        requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
      });
    } finally {
      navigationPending.current = false;
      setNavigating(false);
    }
  }
  async function openConversation(id: string) {
    if (busy) {
      notify('先停止当前回复，再打开另一段对话。');
      return;
    }
    if (navigationPending.current) return;
    navigationPending.current = true;
    setNavigating(true);
    const token = ++navigation.current;
    setToast('');
    setMemoryNotice(null);
    setAttachmentMenu(false);
    try {
      await attempt(async () => {
        if (sharedMapContext) {
          await api.shareMapContext({ enabled: false });
          setSharedMapContext(undefined);
        }
        if (sessionRef.current && sessionRef.current !== id)
          updateState(await api.endConversation(sessionRef.current));
        const [next, saved, info] = await Promise.all([api.messages(id), api.draft(id), api.draftInfo(id)]);
        if (token !== navigation.current) return;
        draftKey.current = id;
        replaceDraft(saved, false);
        setDraftSaved(info.persisted && !info.empty);
        sessionRef.current = id;
        setSessionId(id);
        setMessages(next);
        setPanel(null);
        setView('chat');
        followRef.current = true;
      });
    } finally {
      navigationPending.current = false;
      setNavigating(false);
    }
  }
  async function send(
    value = draftRef.current.text,
    consumeDraft = true,
    retryImage?: Message['image'],
    retryControls?: TurnControls,
  ) {
    const text = value.trim();
    if (!text || busy || navigationPending.current || !draftReady) return;
    const revision = draftRevision.current,
      previousKey = draftKey.current;
    const file = consumeDraft ? draftRef.current.attachment : null,
      image = file?.kind === 'image' ? file : retryImage;
    const content =
      text + (file?.kind === 'text' ? `\n\n[用户附上的文字资料：${file.name}]\n${file.text}` : '');
    setStarting(true);
    setToast('');
    setMemoryNotice(null);
    setAttachmentMenu(false);
    followRef.current = true;
    try {
      const controls = consumeDraft ? turnControlsRef.current : retryControls;
      const result = await api.send({ sessionId, content, controls, ...(image ? { image } : {}) });
      sessionRef.current = result.sessionId;
      setSessionId(result.sessionId);
      draftKey.current = result.sessionId;
      if (consumeDraft && revision === draftRevision.current) replaceDraft({ text: '', attachment: null });
      else replaceDraft(draftRef.current);
      if (previousKey === 'new')
        void attempt(() => api.saveDraft({ id: 'new', draft: { text: '', attachment: null } }));
      if (consumeDraft) {
        turnControlsRef.current = {};
        setTurnControls({});
      }
    } catch (e) {
      notify(errorText(e));
    } finally {
      setStarting(false);
      inputRef.current?.focus();
    }
  }
  async function saveAction(
    item: Action,
    action: 'save' | 'delete' | 'done' = 'save',
  ): Promise<ActionResult> {
    try {
      updateState(await api.action({ item, action }));
      if (action !== 'save') notify(action === 'done' ? '这件事，完成了。' : '已移除这项安排。');
      return { ok: true };
    } catch (error) {
      const text = errorText(error);
      notify(text);
      return { ok: false, error: text };
    }
  }
  async function prepareDisplay(
    input: { sessionId: string; id: string; revision: number } | { matter: SharedMatterView },
  ) {
    await attempt(async () => {
      await api.saveDraft({
        id: draftKey.current,
        draft: draftRef.current,
        ...(turnControlsRef.current.retention === 'session_only'
          ? { retention: 'session_only' as const }
          : {}),
      });
      const next =
        'matter' in input
          ? await api.selectPublicMatter({ id: input.matter.id, revision: input.matter.revision })
          : await api.selectPublicArtifact(input);
      updateState(next);
      setDisplayReview(next.presentation);
    });
  }
  async function endDisplay() {
    const next = await api.setPresentationSurface('private');
    updateState(next);
    const previous = privateReturn.current;
    if (previous.sessionId) await openConversation(previous.sessionId);
    else {
      const saved = await api.draft('new');
      draftKey.current = 'new';
      replaceDraft(saved, false);
      setMessages([]);
      setSessionId(undefined);
      sessionRef.current = undefined;
    }
    setView(previous.view);
    setDraftReady(true);
  }
  function quotePassage(text: string) {
    const quote =
      '关于你刚才这段：\n' +
      text
        .split('\n')
        .map((line) => '> ' + line)
        .join('\n') +
      '\n\n我想继续问：';
    replaceDraft({
      ...draftRef.current,
      text: draftRef.current.text ? draftRef.current.text + '\n\n' + quote : quote,
    });
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  }
  async function showPlace(placeId: string) {
    await attempt(async () => {
      const route = await api.mapRoute({ to: { kind: 'place', id: placeId } });
      setMapSheet(route);
    });
  }
  const conversationRetention = [...messages]
    .reverse()
    .find((message) => message.scopeSummary?.retentionScope === 'conversation')?.scopeSummary;
  const temporaryConversation = conversationRetention?.retention === 'session_only';
  const composer = (
    <div className="composer-area">
      {sharedMapContext && (
        <div className="shared-map-context" role="status">
          <span>本次起点：{sharedMapContext.label}</span>
          <button
            type="button"
            aria-label="停止这次地点参考"
            onClick={() =>
              void attempt(async () => {
                await api.shareMapContext({ enabled: false });
                setSharedMapContext(undefined);
              })
            }
          >
            <X size={13} />
          </button>
        </div>
      )}
      <form
        className={`composer ${busy ? 'is-busy' : ''}`}
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        {attachment && (
          <div className="attachment">
            {attachment.kind === 'image' ? (
              <img className="attachment-preview" src={attachment.dataUrl} alt="" />
            ) : (
              <FileText size={15} />
            )}
            <span>{attachment.name}</span>
            <small>{attachment.kind === 'image' ? '图片 · 随本条发送' : '随本条发送'}</small>
            <IconButton label="移除附件" onClick={() => updateDraft({ attachment: null })}>
              <X size={14} />
            </IconButton>
          </div>
        )}
        <textarea
          ref={inputRef}
          aria-label="和在场说说"
          placeholder={busy ? '可以先写下下一件事…' : empty ? '从一句话开始，不必先想清楚。' : '接着说…'}
          value={input}
          rows={1}
          maxLength={LIMITS.draftText}
          disabled={!draftReady || navigating}
          onChange={(e) => updateDraft({ text: e.target.value })}
          onKeyDown={(e) => {
            if (
              e.key === 'Enter' &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing &&
              e.nativeEvent.keyCode !== 229
            ) {
              e.preventDefault();
              if (!busy) void send();
            }
          }}
        />
        <div className="composer-toolbar">
          <div className="composer-left">
            <div className="attachment-control" ref={attachmentControl}>
              <button
                ref={attachmentTrigger}
                className="icon-button"
                type="button"
                aria-label="添加资料"
                title="添加资料"
                aria-haspopup="menu"
                aria-expanded={attachmentMenu}
                onClick={() => setAttachmentMenu(!attachmentMenu)}
                disabled={!draftReady || navigating}
              >
                <Plus size={21} />
              </button>
              {attachmentMenu && (
                <div
                  className="attachment-menu"
                  ref={attachmentMenuRef}
                  style={attachmentMenuPosition}
                  role="menu"
                  aria-label="添加资料"
                  onKeyDown={(e) => {
                    const items = [
                      ...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
                    ];
                    const i = items.indexOf(document.activeElement as HTMLButtonElement);
                    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                      e.preventDefault();
                      items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
                    }
                    if (e.key === 'Tab') {
                      e.preventDefault();
                      const candidates = [
                        ...document.querySelectorAll<HTMLElement>(
                          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
                        ),
                      ].filter((el) => el.getClientRects().length > 0 && !e.currentTarget.contains(el));
                      const index = candidates.indexOf(attachmentTrigger.current!);
                      const target = candidates[index + (e.shiftKey ? -1 : 1)];
                      setAttachmentMenu(false);
                      (target || attachmentTrigger.current)?.focus({ preventScroll: true });
                    }
                  }}
                >
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setAttachmentMenu(false);
                      void attempt(async () => {
                        const image = await api.attachImage();
                        if (image) updateDraft({ attachment: image });
                        inputRef.current?.focus();
                      });
                    }}
                  >
                    <ImageIcon size={18} />
                    <span>
                      添加图片<small>JPG、PNG 或 WebP</small>
                    </span>
                  </button>
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setAttachmentMenu(false);
                      void attempt(async () => {
                        const file = await api.attachText();
                        if (file) updateDraft({ attachment: file });
                        inputRef.current?.focus();
                      });
                    }}
                  >
                    <Paperclip size={18} />
                    <span>
                      添加文件<small>文本、Markdown 与 PDF</small>
                    </span>
                  </button>
                </div>
              )}
            </div>
            <button
              className="composer-model"
              type="button"
              onClick={() => setView('settings')}
              aria-label={`模型连接：${modelLabel}`}
              title={modelLabel}
            >
              {modelLabel}
              <ChevronDown size={12} />
            </button>
            <button
              type="button"
              className={`composer-context-button ${Object.keys(turnControls).length ? 'selected' : ''}`}
              onClick={() => setScopeOpen(true)}
              aria-label="设置本轮资料范围"
              disabled={navigating}
            >
              <span>
                {turnControls.transmission === 'local_only'
                  ? '仅留在本机'
                  : temporaryConversation
                    ? '此对话不保存'
                    : turnControls.retention === 'session_only'
                      ? '本轮不保存'
                      : turnControls.memoryMode === 'current_sources_only'
                        ? '只看本条与附件'
                        : turnControls.audience && turnControls.audience !== 'self'
                          ? '公开草稿范围'
                          : '资料与保存范围'}
              </span>
              <ChevronDown size={12} />
            </button>
          </div>
          <div className="composer-right">
            {busy ? (
              <button
                className="send-button stop"
                type="button"
                title="停止回复 · Esc"
                aria-label="停止回复"
                onClick={() => void attempt(() => api.stop())}
              >
                <Square size={13} fill="currentColor" />
              </button>
            ) : (
              <button
                className="send-button"
                type="submit"
                aria-label="发送"
                title="发送 · Enter"
                disabled={!input.trim() || !draftReady || navigating}
              >
                <ArrowUp size={22} />
              </button>
            )}
          </div>
        </div>
      </form>
      <div className="composer-foot">
        {temporaryConversation && (
          <span role="status">
            {conversationRetention?.clearConversationOnExit
              ? '离开时清除这段聊天；已登记的安排保留。'
              : '此对话不保存；新建对话恢复常规保存。'}
          </span>
        )}
        {(input || attachment) && (
          <div className="draft-status">
            {draftSaved ? (
              <span role="status">草稿已保存在本机</span>
            ) : turnControls.retention === 'session_only' || temporaryConversation ? (
              <span>临时草稿 · 退出后不保留</span>
            ) : (
              <button
                type="button"
                disabled={savingDraft || navigating}
                onClick={() => void saveCurrentDraft()}
              >
                {savingDraft ? '正在保存…' : '保存草稿到本机'}
              </button>
            )}
          </div>
        )}
        {away && !empty ? (
          <button
            className="scroll-bottom"
            aria-label="回到最新消息"
            onClick={() => {
              followRef.current = true;
              scrollRef.current?.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                  ? 'instant'
                  : 'smooth',
              });
            }}
          >
            <ArrowDown size={15} />
            回到最新
          </button>
        ) : (
          <span className="keyboard-hint">Shift + Enter 换行</span>
        )}
      </div>
    </div>
  );

  const renderedMessages = useMemo(
    () =>
      messages.map((m, index) => (
        <MessageView
          key={m.id}
          message={m}
          timeZone={state?.settings.timeZone}
          agenda={state?.agenda || []}
          matters={state?.matters || []}
          onSave={saveAction}
          onRevoke={(item) => saveAction(item, 'delete')}
          onViewAgenda={() => setView('agenda')}
          onCorrect={() => useSuggestion('刚才有一点需要改正：')}
          onReviseDraft={(recipient) => useSuggestion(`刚才给${recipient}的草稿，请这样修改：`)}
          onPresent={(artifact) =>
            void prepareDisplay({ sessionId: m.sessionId, id: artifact.id, revision: artifact.revision })
          }
          onMessageChanged={(changed) => {
            setToast('');
            setMessages((current) =>
              current.map((message) => (message.id === changed.id ? changed : message)),
            );
          }}
          onQuote={quotePassage}
          onOpenMap={(route) => setMapSheet(route)}
          onPreviewImage={setPreviewImage}
          onCopyText={(text, label = '回复') =>
            void attempt(async () => {
              await api.copyText(text);
              notify(`已复制${label}。`);
            })
          }
          onRetry={() => {
            const user = messages
              .slice(0, index)
              .reverse()
              .find((v) => v.role === 'user');
            if (user) void send(user.content, false, user.image, user.requestControls);
          }}
          busy={busy}
          boundary={`${state?.privacyEpoch}:${state?.policyRevision}`}
        />
      )),
    [messages, state?.agenda, state?.matters, state?.privacyEpoch, state?.policyRevision, busy],
  );

  const memoryHint = memoryNotice && (
    <div className="memory-notice" role="status">
      <span>
        {(memoryNotice as Memory & { status?: string }).status === 'candidate' ? '待确认：' : '记住了：'}
        {memoryNotice.text}
      </span>
      <button
        onClick={() =>
          void attempt(async () => {
            updateState(await api.memory({ action: 'delete', id: memoryNotice.id }));
            setMemoryNotice(null);
          })
        }
      >
        撤销
      </button>
      <IconButton label="收起记忆提示" onClick={() => setMemoryNotice(null)}>
        <X size={13} />
      </IconButton>
    </div>
  );

  if (state?.presentation?.mode === 'public')
    return <PublicDisplay surface={state.presentation} onEnd={endDisplay} notice={publicCloseNotice} />;
  const activeMatter = state?.matters?.find((matter) => matter.sessionId === sessionId);
  const materials = (
    <PreparationShelf
      items={state?.preparations || []}
      timeZone={state?.settings.timeZone}
      onState={updateState}
      onContinue={useSuggestion}
    />
  );
  return (
    <div className="app-shell">
      <div className="app-main">
        <header className="titlebar">
          <button className="brand" onClick={() => setView('chat')} aria-label="在场，回到对话">
            <Portal size={25} />
            <span>在场</span>
          </button>
          <div className="drag-space" />
          <Navigation
            view={view}
            busy={busy || navigating}
            onView={setView}
            onNew={() => void newChat()}
            onHistory={() => setPanel('history')}
            onMap={() => setMapSheet(emptyRoute())}
          />
          <WindowControls onClose={() => void requestClose()} />
        </header>
        <main className={`workspace ${empty ? 'welcome' : 'conversation'}`} hidden={view !== 'chat'}>
          {empty ? (
            <div className="welcome-inner">
              <h1>今天，想聊些什么？</h1>
              {loadError && (
                <div className="harness-inline-error" role="alert">
                  <p>本机内容暂时没有打开：{loadError}</p>
                  <button className="text-button" onClick={() => setLoadAttempt((n) => n + 1)}>
                    重新打开
                  </button>
                </div>
              )}
              {!draftReady && !loadError && (
                <p className="startup-status" role="status">
                  正在打开本机内容…
                </p>
              )}
              {composer}
              <div className="suggestions" aria-label="试着聊聊" hidden={!!input || !!attachment}>
                <button onClick={() => useSuggestion('帮我安排一下今天')}>
                  安排一下今天
                  <ArrowUpRight size={13} />
                </button>
                <button onClick={() => useSuggestion('从主图书馆到紫金港食堂（东区）怎么走？')}>
                  去东区食堂怎么走
                  <ArrowUpRight size={13} />
                </button>
                <button onClick={() => useSuggestion('我想认真弄懂一个证明，请把推导完整讲清楚：')}>
                  把一个证明讲透
                  <ArrowUpRight size={13} />
                </button>
              </div>
              {materials}
            </div>
          ) : (
            <>
              <div
                className="message-scroll"
                ref={scrollRef}
                onScroll={() => {
                  const el = scrollRef.current!;
                  followRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
                  setAway(!followRef.current);
                  rememberReadingPosition();
                }}
              >
                <div className="messages">
                  {renderedMessages}
                  {activeMatter && (
                    <details className="current-matter">
                      <summary>
                        接着处理「{activeMatter.title}」<ChevronRight size={14} />
                      </summary>
                      <MatterCard
                        matter={activeMatter}
                        interaction={matterInteractions[activeMatter.id]}
                        onInteraction={(value) => updateMatterInteraction(activeMatter.id, value)}
                        onState={updateState}
                        onPresent={() => void prepareDisplay({ matter: activeMatter })}
                        onMap={(id) => void showPlace(id)}
                      />
                    </details>
                  )}
                  {materials}
                </div>
              </div>
              <div className="bottom-composer">
                {memoryHint}
                {composer}
              </div>
            </>
          )}
        </main>
        {view === 'agenda' && state && (
          <AgendaView
            state={state}
            matterInteractions={matterInteractions}
            onMatterInteraction={updateMatterInteraction}
            onAction={(a, operation) => void saveAction(a, operation)}
            onResume={openConversation}
            onChanged={() => void attempt(async () => updateState(await api.state()))}
            onClose={() => setView('chat')}
            onCompose={() => useSuggestion('帮我记一件事：')}
            onState={updateState}
            onPresentMatter={(matter) => void prepareDisplay({ matter })}
            onMap={(id) => void showPlace(id)}
          />
        )}
        {(view === 'settings' || view === 'memory') && state && (
          <SettingsPanel
            key={`${view}:${state.privacyEpoch}`}
            embedded
            initialTab={view === 'memory' ? '记忆' : '连接'}
            state={state}
            busy={busy}
            onClose={() => setView('chat')}
            onState={updateState}
            draft={settingsDraft}
            memoryWorkspace={memoryWorkspace}
            onMemoryWorkspace={(change) => {
              if (boundaryRevision.current.split(':')[0] === String(state.privacyEpoch))
                setMemoryWorkspace(change);
            }}
            notify={notify}
            onClear={() => newChat()}
          />
        )}
      </div>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {busy ? '正在处理你的请求。' : messages.at(-1)?.status === 'done' ? '回复已准备好。' : ''}
      </div>
      {displayReview && (
        <DisplayReview
          surface={displayReview}
          onStart={async () => {
            updateState(await api.setPresentationSurface('public'));
          }}
          onClose={() => {
            setDisplayReview(undefined);
            void api.clearPublicArtifact().catch(() => {});
          }}
        />
      )}
      {panel === 'history' && state && (
        <HistoryPanel
          state={state}
          busy={busy}
          onClose={() => setPanel(null)}
          onRestoreFocus={() => inputRef.current?.focus({ preventScroll: true })}
          onOpen={openConversation}
          onDelete={async (id) => {
            await attempt(async () => {
              updateState(await api.deleteConversation(id));
              if (id === sessionId) newChat();
            });
          }}
        />
      )}
      {previewImage && (
        <Modal title="图片预览" className="image-preview-panel" onClose={() => setPreviewImage(undefined)}>
          <div className="image-preview-body">
            <img
              className="image-preview-content"
              src={previewImage.dataUrl}
              alt={`图片预览：${previewImage.name}`}
            />
          </div>
        </Modal>
      )}
      {closingDrafts && (
        <Modal
          title="还有没说完的话。"
          onClose={() => setClosingDrafts(undefined)}
          className="draft-exit-panel"
        >
          <div className="panel-body">
            <p className="panel-intro">这些草稿还只在当前窗口中。保存到本机后，下次可以接着写。</p>
            <div className="draft-exit-list">
              {closingDrafts.map((d) => (
                <article key={d.id}>
                  <strong>{state?.conversations.find((c) => c.id === d.id)?.title || '新的一页'}</strong>
                  <p>{d.text || '只有附件'}</p>
                  {d.attachmentName && <small>附件：{d.attachmentName}</small>}
                  {d.temporary && <small className="draft-temporary">这条选择了不保存，退出后会丢弃。</small>}
                </article>
              ))}
            </div>
            {closeError && (
              <p className="harness-inline-error" role="alert">
                {closeError}
              </p>
            )}
            <div className="field-buttons">
              {closingDrafts.some((d) => !d.temporary) && (
                <button
                  className="primary-button"
                  disabled={savingDraft}
                  onClick={() =>
                    void (async () => {
                      setSavingDraft(true);
                      setCloseError('');
                      try {
                        for (const draft of closingDrafts.filter((d) => !d.temporary)) {
                          const info = await api.draftInfo(draft.id);
                          if (info.digest !== draft.digest)
                            throw new Error('草稿内容已变化，请返回查看后再保存。');
                          if (!info.persisted)
                            await api.persistDraft({ id: draft.id, digest: draft.digest, confirmed: true });
                        }
                        api.window('close-confirmed');
                      } catch (error) {
                        setCloseError(errorText(error));
                      } finally {
                        setSavingDraft(false);
                      }
                    })()
                  }
                >
                  {savingDraft
                    ? '正在保存…'
                    : closingDrafts.some((d) => d.temporary)
                      ? '保存非临时草稿并退出'
                      : '保存并退出'}
                </button>
              )}
              <button
                className="subtle-button"
                disabled={savingDraft}
                onClick={() => setClosingDrafts(undefined)}
              >
                继续编辑
              </button>
              <button
                className="text-button"
                disabled={savingDraft}
                onClick={() => api.window('close-confirmed')}
              >
                放弃未保存草稿并退出
              </button>
            </div>
          </div>
        </Modal>
      )}
      {mapSheet && (
        <MapSheet
          initialRoute={mapSheet}
          onWindowClose={() => void requestClose()}
          returnLabel={
            view === 'chat'
              ? '返回对话'
              : view === 'agenda'
                ? '返回安排'
                : view === 'memory'
                  ? '返回关于你'
                  : '返回连接与偏好'
          }
          onClose={() => setMapSheet(null)}
          onUseContext={({ text, label, expiresAt }) => {
            setSharedMapContext({ label, expiresAt });
            setView('chat');
            replaceDraft({
              ...draftRef.current,
              text: draftRef.current.text ? draftRef.current.text + '\n' + text : text,
            });
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
        />
      )}
      {scopeOpen && (
        <ScopeSettings
          value={turnControls}
          onClose={() => setScopeOpen(false)}
          onChange={(value) => {
            turnControlsRef.current = value;
            setTurnControls(value);
            if (value.retention === 'session_only')
              void attempt(() =>
                api.saveDraft({
                  id: draftKey.current,
                  draft: draftRef.current,
                  retention: 'session_only',
                }),
              );
            else void attempt(() => api.saveDraft({ id: draftKey.current, draft: draftRef.current }));
          }}
        />
      )}
    </div>
  );
}

function MessageView({
  message: m,
  timeZone = DEFAULT_TIME_ZONE,
  agenda,
  matters,
  onSave,
  onRevoke,
  onCopyText,
  onRetry,
  onCorrect,
  onReviseDraft,
  onPresent,
  onMessageChanged,
  onQuote,
  onViewAgenda,
  onOpenMap,
  onPreviewImage,
  busy,
  boundary,
}: {
  message: Message;
  timeZone?: string;
  agenda: Action[];
  matters: SharedMatterView[];
  onSave: (item: Action) => Promise<ActionResult>;
  onRevoke: (item: Action) => Promise<ActionResult>;
  onCopyText: (text: string, label?: string) => void;
  onRetry: () => void;
  onCorrect: () => void;
  onReviseDraft: (recipient: string) => void;
  onPresent: (artifact: ReleaseArtifact) => void;
  onMessageChanged: (message: Message) => void;
  onQuote: (text: string) => void;
  onViewAgenda: () => void;
  onOpenMap: (route: MapRouteResult) => void;
  onPreviewImage: (image: NonNullable<Message['image']>) => void;
  busy: boolean;
  boundary: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selectedPassage, setSelectedPassage] = useState('');
  const article = useRef<HTMLElement>(null),
    prose = useRef<HTMLDivElement>(null),
    exposed = useRef(false);
  useEffect(() => {
    if (
      m.role !== 'assistant' ||
      m.status !== 'done' ||
      !m.cooperationId ||
      !article.current ||
      exposed.current
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          !entries.some(
            (entry) =>
              entry.isIntersecting &&
              entry.intersectionRect.height >= Math.min(60, entry.boundingClientRect.height),
          ) ||
          exposed.current
        )
          return;
        exposed.current = true;
        void api
          .recordResponseExposure({ sessionId: m.sessionId, messageId: m.id, event: 'displayed' })
          .catch(() => {});
      },
      { threshold: 0 },
    );
    observer.observe(article.current);
    return () => observer.disconnect();
  }, [m.id, m.status, m.cooperationId, boundary]);
  function selectionChanged() {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !prose.current?.contains(selection.getRangeAt(0).commonAncestorContainer)) {
      setSelectedPassage('');
      return;
    }
    const fragment = selection.getRangeAt(0).cloneContents();
    const formulas = fragment.querySelectorAll('.katex');
    let text = selection.toString().trim();
    if (formulas.length) {
      for (const formula of formulas) {
        const tex = formula.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
        if (tex) formula.replaceWith(document.createTextNode('$' + tex + '$'));
      }
      text = fragment.textContent?.trim() || text;
    }
    setSelectedPassage(text.length <= 6000 ? text : '');
  }
  if (m.role === 'user')
    return (
      <article className="user-message" aria-label="你的消息">
        <div className="message-byline">
          你
          <span>
            {new Date(m.createdAt).toLocaleTimeString('zh-CN', {
              timeZone,
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            })}
          </span>
        </div>
        <div className="user-message-stack">
          {m.image && (
            <button
              type="button"
              className="sent-image-preview"
              aria-label={`预览图片：${m.image.name}`}
              onClick={() => onPreviewImage(m.image!)}
            >
              <img src={m.image.dataUrl} alt={`已上传的图片：${m.image.name}`} />
            </button>
          )}
          <div className="user-message-text">{m.content}</div>
        </div>
      </article>
    );
  const running = m.steps.filter((s) => s.status === 'running'),
    current = running.at(-1),
    hasBlocked =
      m.steps.some((s) => s.status === 'blocked') || m.obligations.some((o) => o.status === 'blocked');
  const processBlock = m.steps.length ? (
    <div className={`process ${m.status === 'running' ? 'live' : ''}`}>
      <button
        className="process-summary"
        aria-expanded={expanded}
        aria-controls={`process-${m.id}`}
        onClick={() => setExpanded(!expanded)}
      >
        {m.status === 'running' ? (
          <LoaderCircle size={14} className="spin" />
        ) : m.status === 'error' ? (
          <CircleAlert size={14} />
        ) : (
          <Check size={14} />
        )}
        <span>
          {current?.title ||
            (m.status === 'cancelled'
              ? '已停止处理'
              : m.status === 'error'
                ? '有一步需要重新试试'
                : hasBlocked
                  ? '部分资料或步骤未完成'
                  : '处理过程')}
        </span>
        <ChevronRight size={13} className={expanded ? 'rotated' : ''} />
      </button>
      <div
        id={`process-${m.id}`}
        className={`process-reveal ${expanded ? 'open' : ''}`}
        aria-hidden={!expanded}
      >
        <div className="process-clip">
          <div className="process-detail">
            {m.obligations.length > 0 && (
              <div className="obligations">
                <span className="minor-label">本次包含</span>
                {m.obligations.map((o) => (
                  <div key={o.id} className={o.status}>
                    <span aria-hidden="true">
                      {o.status === 'done' ? '✓' : o.status === 'blocked' ? '–' : '·'}
                    </span>
                    <span className="sr-only">
                      {o.status === 'done' ? '已完成：' : o.status === 'blocked' ? '未完成：' : '处理中：'}
                    </span>
                    {o.title}
                  </div>
                ))}
              </div>
            )}
            {m.steps
              .filter((s) => !m.obligations.some((o) => o.title === s.title))
              .map((s) => (
                <div className={`step ${s.status}`} key={s.id}>
                  {s.status === 'running' ? (
                    <LoaderCircle size={13} className="spin" />
                  ) : s.status === 'done' ? (
                    <Check size={13} />
                  ) : (
                    <CircleAlert size={13} />
                  )}
                  <div>
                    <span>
                      {s.scope && <em>{s.scope} / </em>}
                      {s.title}
                    </span>
                    {s.detail && <p>{s.detail}</p>}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  ) : null;
  return (
    <article className="assistant-message" ref={article}>
      <div className="assistant-name">
        <Portal size={23} />
        <span>在场</span>
        {m.demo && <small>示例</small>}
      </div>
      {(m.status !== 'done' || hasBlocked) && processBlock}
      {!!(m.responseText ?? m.content) && (
        <div className="markdown" ref={prose} onMouseUp={selectionChanged} onKeyUp={selectionChanged}>
          <RichText text={m.responseText ?? m.content} />
        </div>
      )}
      {!!selectedPassage && (
        <button
          className="quote-selection subtle-button"
          onClick={() => {
            onQuote(selectedPassage);
            setSelectedPassage('');
          }}
        >
          <Quote size={14} />
          引用所选内容继续
        </button>
      )}
      {m.actions.some((action) => {
        const current = agenda.find((item) => item.id === action.id);
        return current && (current.revision || 1) !== (action.revision || 1);
      }) && <p className="historical-change">安排后来有过修改，下面是当前内容。</p>}
      {m.actions.map((a) => (
        <ActionCard
          key={a.id}
          action={agenda.find((v) => v.id === a.id) || a}
          timeZone={timeZone}
          saved={agenda.some((v) => v.id === a.id)}
          onSave={onSave}
          onRevoke={onRevoke}
          onView={onViewAgenda}
          disabled={busy}
          boundary={boundary}
          onRecheck={onRetry}
        />
      ))}
      {[
        ...new Map(
          (m.releaseArtifacts || [])
            .slice()
            .sort((a, b) => a.revision - b.revision)
            .map((artifact) => [artifact.id, artifact]),
        ).values(),
      ].map((artifact) => (
        <ReleaseCard
          key={artifact.id}
          artifact={artifact}
          versions={(m.releaseArtifacts || []).filter(
            (value) => value.id === artifact.id && value.revision < artifact.revision,
          )}
          persisted={m.retention !== 'session_only'}
          onCopy={onCopyText}
          onRevise={() => onReviseDraft(artifact.brief.recipient)}
          onPresent={() => onPresent(artifact)}
          onSave={async (body, expectedRevision) =>
            onMessageChanged(
              await api.editReleaseArtifact({
                sessionId: m.sessionId,
                messageId: m.id,
                id: artifact.id,
                expectedRevision,
                body,
              }),
            )
          }
          onRefresh={async () => {
            const current = (await api.messages(m.sessionId)).find((message) => message.id === m.id);
            if (current) onMessageChanged(current);
          }}
          disabled={busy}
        />
      ))}
      {(m.objectStates || []).flatMap((item) => {
        const current =
          item.kind === 'work' &&
          matters.find((matter) => matter.id === item.id && matter.revision !== item.historicalRevision);
        return current
          ? [
              <p key={item.id} className="historical-change">
                「{current.title}」后来有过调整；这里保留当时的回复。
              </p>,
            ]
          : [];
      })}
      <ReplyEvidence message={m} />
      {m.mapCards?.map((card, cardIndex) => (
        <MapRouteCard key={cardIndex} card={card} onOpen={() => onOpenMap(card.route)} />
      ))}
      {m.status !== 'running' && (
        <div className="message-actions">
          <IconButton label="复制回复" onClick={() => onCopyText(m.responseText ?? m.content)}>
            <Copy size={14} />
          </IconButton>
          {m.status === 'done' && (
            <button className="text-button" onClick={onCorrect} disabled={busy}>
              补充或纠正
            </button>
          )}
          {m.status === 'done' && !m.demo && m.retention !== 'session_only' && (
            <FeedbackControl messageId={m.id} />
          )}
          {(m.status === 'error' || m.status === 'cancelled') && (
            <div className="message-recovery">
              <button className="text-button" onClick={onRetry} disabled={busy}>
                <RotateCcw size={13} />
                重新试试
              </button>
              <small>沿用原消息、图片和本轮范围；当前输入草稿会保留。</small>
            </div>
          )}
        </div>
      )}
      {m.status === 'done' && !hasBlocked && processBlock}
    </article>
  );
}

function ReleaseCard({
  artifact,
  versions,
  persisted,
  onCopy,
  onRevise,
  onPresent,
  onSave,
  onRefresh,
  disabled,
}: {
  artifact: ReleaseArtifact;
  versions: ReleaseArtifact[];
  persisted: boolean;
  onCopy: (text: string, label?: string) => void;
  onRevise: () => void;
  onPresent: () => void;
  onSave: (body: string, expectedRevision: number) => Promise<void>;
  onRefresh: () => Promise<void>;
  disabled: boolean;
}) {
  const [editing, setEditing] = useState(false),
    [body, setBody] = useState(artifact.body),
    [temporary, setTemporary] = useState<string>(),
    [saving, setSaving] = useState(false),
    [error, setError] = useState('');
  const editRevision = useRef(artifact.revision);
  const bodyInput = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = bodyInput.current;
    if (!el) return;
    const scrollTop = el.scrollTop;
    el.style.height = 'auto';
    el.style.height = Math.max(86, Math.min(el.scrollHeight, 320, window.innerHeight * 0.38)) + 'px';
    el.scrollTop =
      document.activeElement === el && el.selectionEnd === el.value.length ? el.scrollHeight : scrollTop;
  }, [body, editing]);
  const visibleBody = temporary ?? artifact.body;
  async function save(current = false) {
    if (!body.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      if (persisted) await onSave(body, current ? artifact.revision : editRevision.current);
      else setTemporary(body);
      setEditing(false);
    } catch (error) {
      setError(errorText(error));
      await onRefresh();
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="release-card" aria-label={`给${artifact.brief.recipient}的草稿，未发送`}>
      <div className="release-card-heading">
        <div>
          <span>给{artifact.brief.recipient}</span>
          <strong>
            {temporary ? '本轮修改的草稿' : artifact.authoredBy === 'user' ? '你修改过的草稿' : '草稿已准备'}
          </strong>
        </div>
        <span className="release-state">未发送</span>
      </div>
      {editing ? (
        <form
          className="release-editor"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label className="field-label">
            修改草稿
            <textarea
              aria-label="修改草稿正文"
              ref={bodyInput}
              autoFocus
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={3}
              maxLength={16000}
            />
          </label>
          {error && (
            <div className="inline-problem" role="alert">
              <p>{error} 你的文字仍保留。</p>
              <details>
                <summary>查看当前保存的稿件</summary>
                <div className="markdown">
                  <RichText text={artifact.body} />
                </div>
              </details>
            </div>
          )}
          <div className="field-buttons">
            {error ? (
              <button
                type="button"
                className="primary-button"
                onClick={() => void save(true)}
                disabled={saving || !body.trim()}
              >
                {saving ? '正在保存…' : '保留我的文字，按当前版本保存'}
              </button>
            ) : (
              <button className="primary-button" disabled={saving || !body.trim()}>
                {saving ? '正在保存…' : persisted ? '保存稿件修改' : '用于本轮'}
              </button>
            )}
            <button type="button" className="text-button" onClick={() => setEditing(false)} disabled={saving}>
              取消编辑
            </button>
          </div>
        </form>
      ) : (
        <div className="release-body markdown">
          <RichText text={visibleBody} />
        </div>
      )}
      {!editing && (
        <div className="release-card-actions">
          <button className="primary-button" onClick={() => onCopy(visibleBody, '草稿')}>
            <Copy size={14} />
            复制草稿
          </button>
          {!editing && (
            <button
              className="text-button"
              onClick={() => {
                setBody(visibleBody);
                editRevision.current = artifact.revision;
                setError('');
                setEditing(true);
              }}
              disabled={disabled}
            >
              <Pencil size={13} />
              直接编辑
            </button>
          )}
          <details className="quiet-menu">
            <summary>更多</summary>
            <button onClick={onRevise} disabled={disabled}>
              继续请在场修改
            </button>
            <button onClick={onPresent} disabled={disabled || !persisted}>
              展示这份稿件
            </button>
          </details>
          <small>{persisted ? '复制后可到原服务发送' : '临时稿件 · 退出后不保留'}</small>
        </div>
      )}
      {!!versions.length && (
        <details className="release-versions">
          <summary>查看之前的版本</summary>
          {versions
            .slice()
            .reverse()
            .map((version) => (
              <article key={version.revision}>
                <small>版本 {version.revision}</small>
                <div className="markdown">
                  <RichText text={version.body} />
                </div>
              </article>
            ))}
        </details>
      )}
    </section>
  );
}

function ActionCard({
  action,
  timeZone,
  saved,
  onSave,
  onRevoke,
  onView,
  disabled,
  boundary,
  onRecheck,
}: {
  action: Action;
  timeZone: string;
  saved: boolean;
  onSave: (item: Action) => Promise<ActionResult>;
  onRevoke: (item: Action) => Promise<ActionResult>;
  onView: () => void;
  disabled: boolean;
  boundary: string;
  onRecheck: () => void;
}) {
  const zone = action.timeZone || timeZone;
  const [editing, setEditing] = useState(false),
    [title, setTitle] = useState(action.title),
    [detail, setDetail] = useState(action.detail),
    [time, setTime] = useState(toTimeInput(action.startsAt, zone));
  const [effect, setEffect] = useState<Awaited<ReturnType<typeof api.actionState>>>(),
    [revoking, setRevoking] = useState(false);
  const [saving, setSaving] = useState(false),
    [actionError, setActionError] = useState('');
  const editBase = useRef(action);
  useEffect(() => {
    if (!editing) {
      setTitle(action.title);
      setDetail(action.detail);
      setTime(toTimeInput(action.startsAt, zone));
      editBase.current = action;
    }
  }, [action.revision, action.title, action.detail, action.startsAt, editing, zone]);
  useEffect(() => {
    let live = true;
    api
      .actionState(action.effectActionId || action.id)
      .then((v) => {
        if (live) setEffect(v);
      })
      .catch(() => setEffect({ action: null, receipts: [] }));
    return () => {
      live = false;
    };
  }, [action.id, action.effectActionId, boundary, saved]);
  async function revoke() {
    if (revoking) return;
    setRevoking(true);
    try {
      const result = await onRevoke(action);
      if (!result.ok) {
        setActionError(result.error || '撤销没有完成，请重新核对。');
        return;
      }
      setEffect(await api.actionState(action.effectActionId || action.id));
    } finally {
      setRevoking(false);
    }
  }
  const latestReceipt = effect?.receipts.at(-1);
  const localRemoved =
    effect?.localRecord === null &&
    effect?.action?.status === 'succeeded' &&
    latestReceipt?.status === 'confirmed_success';
  const localSaved =
    effect?.action?.status === 'succeeded' &&
    latestReceipt?.status === 'confirmed_success' &&
    effect.localRecord !== null &&
    (latestReceipt.localStatus === 'local_saved' || !!effect.localRecord);
  const failure = effect?.action?.status === 'failed_confirmed';
  const unresolved =
    !!effect?.action &&
    ['outcome_unknown', 'unresolved', 'reconciling', 'cancel_requested', 'cancellation_unknown'].includes(
      effect.action.status,
    );
  const cancelled =
    !!effect?.action &&
    ['cancelled', 'cancellation_confirmed', 'cannot_cancel'].includes(effect.action.status);
  if (localRemoved)
    return (
      <div className="saved-action removed-action">
        <Check size={18} />
        <div>
          <strong>{action.title}</strong>
          <small>这项安排已移除。</small>
        </div>
        <button className="text-button" onClick={onView}>
          查看安排
          <ChevronRight size={14} />
        </button>
      </div>
    );
  if (saved && effect === undefined)
    return (
      <div className="saved-action saved-action-pending" aria-live="polite">
        <LoaderCircle size={18} className="spin" />
        <div>
          <strong>{action.title}</strong>
          <small>正在核对保存结果…</small>
        </div>
      </div>
    );
  if (localSaved)
    return (
      <div className="saved-action saved-action-receipt">
        <Check size={19} aria-hidden="true" />
        <div>
          <strong>{action.title}</strong>
          <small>
            {action.done ? '已完成' : '已加入安排'}
            {action.startsAt ? ` · ${formatDate(action.startsAt, zone)} · ${timeZoneLabel(zone)}` : ''}
            {action.coverage === 'conditional' ? ' · 条件待核对' : ''}
          </small>
          {actionError && (
            <p className="inline-problem" role="alert">
              {actionError}
            </p>
          )}
        </div>
        <button
          className="text-button"
          onClick={() => void revoke()}
          disabled={disabled || revoking}
          aria-label={`撤销本机登记：${action.title}`}
        >
          {revoking ? '正在撤销…' : '撤销'}
        </button>
        <button className="text-button" onClick={onView}>
          查看安排
          <ChevronRight size={14} />
        </button>
      </div>
    );
  if (saved && (failure || unresolved || !effect?.action))
    return (
      <div className="stale-action action-receipt-warning">
        <CircleAlert size={17} aria-hidden="true" />
        <div>
          <strong>{action.title}</strong>
          <p>
            {failure
              ? '这项安排尚未保存。'
              : unresolved
                ? '结果还不能确认，请先核对再继续。'
                : '这项安排的保存结果暂时无法核对。'}
          </p>
          <button className="text-button" onClick={onView} disabled={disabled}>
            核对操作结果
          </button>
        </div>
      </div>
    );
  if (cancelled)
    return (
      <div className="stale-action action-receipt-warning">
        <CircleAlert size={17} aria-hidden="true" />
        <div>
          <strong>{action.title}</strong>
          <p>
            {effect?.action?.status === 'cancellation_confirmed'
              ? '这项安排已撤销。'
              : '这项操作已停止，结果需要核对。'}
          </p>
          <button className="text-button" onClick={onView} disabled={disabled}>
            查看安排
          </button>
        </div>
      </div>
    );
  if (
    effect?.action &&
    [
      'cancelled',
      'cancel_requested',
      'outcome_unknown',
      'unresolved',
      'cannot_cancel',
      'cancellation_unknown',
      'cancellation_confirmed',
    ].includes(effect.action.status)
  )
    return (
      <div className="stale-action">
        <CircleAlert size={17} />
        <div>
          <strong>{action.title}</strong>
          <p>
            {[
              'outcome_unknown',
              'unresolved',
              'cancel_requested',
              'cannot_cancel',
              'cancellation_unknown',
            ].includes(effect.action.status)
              ? '结果待核查，请在安排中核对操作结果。'
              : '这项建议的依据已经变化，确认前需要重新核对。'}
          </p>
          <button
            className="text-button"
            onClick={
              [
                'outcome_unknown',
                'unresolved',
                'cancel_requested',
                'cannot_cancel',
                'cancellation_unknown',
              ].includes(effect.action.status)
                ? onView
                : onRecheck
            }
            disabled={disabled}
          >
            {[
              'outcome_unknown',
              'unresolved',
              'cancel_requested',
              'cannot_cancel',
              'cancellation_unknown',
            ].includes(effect.action.status)
              ? '核对操作结果'
              : '重新核对'}
          </button>
        </div>
      </div>
    );
  return (
    <div className="action-card">
      <div className="action-eyebrow">
        <span className="status-dot suggestion" aria-hidden="true" />
        {action.demo ? '建议 · 示例' : '接下来可以'}
      </div>
      {editing ? (
        <div className="action-edit">
          <label>
            想做的事
            <input value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            补充
            <textarea value={detail} maxLength={1500} onChange={(e) => setDetail(e.target.value)} />
          </label>
          <label>
            留个时间（{timeZoneLabel(zone)}） <small>可选</small>
            <input type="datetime-local" step="1" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        </div>
      ) : (
        <>
          <h3>{title}</h3>
          <p>{detail}</p>
          {action.startsAt && (
            <div className="action-time">
              <CalendarDays size={13} />
              {formatDate(action.startsAt, zone)} · {timeZoneLabel(zone)}
            </div>
          )}
        </>
      )}
      <div className="action-buttons">
        <button
          className={`primary-button ${saved ? 'saved' : ''}`}
          disabled={disabled || saved || saving || !title.trim()}
          onClick={() => {
            let startsAt: string | undefined;
            try {
              startsAt = fromTimeInput(time, zone, editBase.current.startsAt);
            } catch (error) {
              setActionError(errorText(error));
              return;
            }
            setSaving(true);
            setActionError('');
            void onSave({
              ...editBase.current,
              title,
              detail,
              startsAt,
              timeZone: zone,
            })
              .then((result) => {
                if (result.ok) setEditing(false);
                else setActionError(result.error || '修改还未保存。');
              })
              .finally(() => setSaving(false));
          }}
        >
          {saved ? (
            <>
              <Check size={15} />
              已加入安排
            </>
          ) : (
            <>
              {action.coverage === 'conditional' ? '保存为待核对安排' : '加入我的安排'}
              <ArrowUpRight size={15} />
            </>
          )}
        </button>
        {!saved && (
          <button className="text-button" disabled={disabled} onClick={() => setEditing(!editing)}>
            {editing ? '取消修改' : '调整一下'}
          </button>
        )}
      </div>
      {actionError && (
        <p className="inline-problem" role="alert">
          {actionError} 你填写的内容仍保留。
        </p>
      )}
      <small className="action-caption">
        保存在本机{action.startsAt || time ? ' · 提醒需在偏好中开启' : ''}
      </small>
      {action.coverage === 'conditional' && (
        <p className="action-conditions">
          尚需核对：{[...new Set((action.missingNeeds || []).map(needName))].join('、') || '相关条件'}
          。保存只记录在本机。
        </p>
      )}
    </div>
  );
}

function HistoryPanel({
  state,
  busy,
  onClose,
  onOpen,
  onDelete,
  onRestoreFocus,
}: {
  state: State;
  busy: boolean;
  onClose: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onRestoreFocus: () => void;
}) {
  const [query, setQuery] = useState(''),
    [deleting, setDeleting] = useState('');
  const list = state.conversations.filter((c) => c.title.toLowerCase().includes(query.toLowerCase()));
  return (
    <Modal title="历史对话" onClose={onClose} fallbackFocus={onRestoreFocus}>
      <div className="panel-body">
        <div className="search-box">
          <Search size={16} />
          <input
            aria-label="搜索对话标题"
            placeholder="搜索对话标题"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <kbd>⌘ / Ctrl K</kbd>
        </div>
        {list.length ? (
          <div className="history-list">
            {list.map((c) => (
              <div className="history-item" key={c.id}>
                <button onClick={() => onOpen(c.id)} disabled={busy}>
                  <span>{c.title}</span>
                  <small>{formatDate(c.updatedAt, state.settings.timeZone)}</small>
                </button>
                {deleting === c.id ? (
                  <div className="delete-confirm">
                    <button onClick={() => onDelete(c.id)} disabled={busy}>
                      删除
                    </button>
                    <button onClick={() => setDeleting('')}>取消</button>
                  </div>
                ) : (
                  <IconButton
                    label={`删除对话：${c.title}`}
                    onClick={() => setDeleting(c.id)}
                    disabled={busy}
                  >
                    <Trash2 size={15} />
                  </IconButton>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="panel-empty">
            <History size={29} />
            <h3>{query ? '没有找到这段对话。' : '故事，从第一次对话开始。'}</h3>
            <p>{query ? '换一个标题关键词试试。' : '聊过的事会留在本机，需要时再回来。'}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
