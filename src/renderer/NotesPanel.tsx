import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  History,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  NOTE_LIMITS,
  type NoteDocument,
  type NoteHistory,
  type NoteList,
  type NoteMutation,
  type NotesBridge,
} from '../shared/notes';
import { IconButton, PagePanel, uiError } from './ui';
import { DEFAULT_TIME_ZONE, formatDateTime } from './time';
import type { LocalSearchLocator } from '../shared/search';
import './notes.css';

type Editor = { note?: NoteDocument; title: string; body: string };
const fresh = (): Editor => ({ title: '', body: '' });
const keyOf = (editor: Editor) => editor.note?.id || 'new';
const isDirty = (editor?: Editor) =>
  !!editor &&
  (editor.note
    ? editor.title !== editor.note.title || editor.body !== editor.note.body
    : !!editor.title || !!editor.body);
const editable = (note: NoteDocument): Editor => ({
  note,
  title: note.title,
  body: note.body,
});

function revealNoteMatch(control: HTMLInputElement | HTMLTextAreaElement, start: number, end: number) {
  control.focus({ preventScroll: true });
  control.setSelectionRange(start, end);
  if (control instanceof HTMLTextAreaElement) {
    // Native selection does not scroll an off-screen match into a textarea.
    // Measure its actual wrapped lines with the same text metrics, without
    // changing the note, caret contents or the editor's saved draft.
    const style = window.getComputedStyle(control), mirror = document.createElement('div');
    mirror.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;white-space:pre-wrap;overflow-wrap:break-word;border:0;box-sizing:border-box;';
    for (const property of ['font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'word-spacing', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'text-indent', 'tab-size']) mirror.style.setProperty(property, style.getPropertyValue(property));
    mirror.style.width = `${control.clientWidth}px`;
    mirror.append(document.createTextNode(control.value.slice(0, start)));
    const mark = document.createElement('span');
    mark.textContent = control.value.slice(start, end) || '\u200b';
    mirror.append(mark); document.body.append(mirror);
    control.scrollTop = Math.max(0, mark.offsetTop - control.clientHeight / 2);
    mirror.remove();
  }
  control.scrollIntoView({ block: 'nearest' });
}

function NotesFrame({
  embedded,
  onClose,
  children,
}: {
  embedded: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return embedded ? (
    <section className="notes-page notes-embedded" aria-label="笔记">
      <div className="notes-content">
        <h2 className="sr-only" data-notes-focus tabIndex={-1}>
          笔记
        </h2>
        {children}
      </div>
    </section>
  ) : (
    <PagePanel title="笔记" onClose={onClose} className="notes-page">
      {children}
    </PagePanel>
  );
}

/** A separate notebook. Saving here does not create memories or arrangements. */
export function NotesPanel({
  onClose,
  onUnsavedChange,
  active = true,
  focus,
  embedded = false,
  bridge = window.zaichang as unknown as NotesBridge,
  timeZone = DEFAULT_TIME_ZONE,
}: {
  onClose: () => void;
  onUnsavedChange?: (unsaved: boolean) => void;
  active?: boolean;
  focus?: { locator: Extract<LocalSearchLocator, { kind: 'note' }>; requestId: number };
  embedded?: boolean;
  bridge?: NotesBridge;
  timeZone?: string;
}) {
  const [list, setList] = useState<NoteList>({
    items: [],
    total: 0,
    offset: 0,
    hasMore: false,
  });
  const [query, setQuery] = useState(''),
    [appliedQuery, setAppliedQuery] = useState('');
  const [state, setState] = useState<'active' | 'deleted'>('active');
  const [editor, setEditor] = useState<Editor>(),
    [conflict, setConflict] = useState<NoteDocument>();
  const [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [receipt, setReceipt] = useState(''),
    [undoRevision, setUndoRevision] = useState<number>();
  const [history, setHistory] = useState<NoteHistory>(),
    [version, setVersion] = useState<NoteDocument>();
  const [closing, setClosing] = useState(false),
    [draftCount, setDraftCount] = useState(0);
  const drafts = useRef(new Map<string, Editor>()),
    request = useRef(0),
    listRequest = useRef(0),
    mounted = useRef(true);
  const host = useRef<HTMLDivElement>(null);
  const focusRequest = useRef(0), focusPending = useRef<typeof focus>(undefined);
  const unsavedCallback = useRef(onUnsavedChange);
  unsavedCallback.current = onUnsavedChange;
  const dirty = isDirty(editor),
    deleted = editor?.note?.state === 'deleted';
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current++;
      listRequest.current++;
    };
  }, []);
  useEffect(() => {
    if (active)
      host.current
        ?.querySelector<HTMLHeadingElement>('h1, [data-notes-focus]')
        ?.focus({ preventScroll: true });
  }, [active]);
  useEffect(() => {
    onUnsavedChange?.(dirty || draftCount > 0);
  }, [dirty, draftCount, onUnsavedChange]);
  useEffect(() => () => unsavedCallback.current?.(false), []);
  useEffect(() => {
    if (closing)
      host.current
        ?.querySelector<HTMLElement>('.notes-leave')
        ?.scrollIntoView({ block: 'nearest' });
  }, [closing]);
  useEffect(() => {
    if (history || conflict) {
      host.current?.querySelector<HTMLElement>('.notes-side')?.scrollIntoView({ block: 'nearest' });
    }
  }, [!!history, !!conflict]);

  async function loadList(nextState = state, search = appliedQuery, append = false) {
    const token = ++listRequest.current;
    setLoading(true);
    try {
      const result = await bridge.notesList({
        state: nextState,
        query: search,
        offset: append ? list.items.length : 0,
      });
      if (!mounted.current || token !== listRequest.current) return;
      setList((current) =>
        append ? { ...result, items: [...current.items, ...result.items] } : result,
      );
    } catch (cause) {
      if (mounted.current && token === listRequest.current) setError(uiError(cause));
    } finally {
      if (mounted.current && token === listRequest.current) setLoading(false);
    }
  }
  useEffect(() => {
    if (active) void loadList();
  }, [state, appliedQuery, active]);
  useEffect(() => {
    if (!active || !focus || busy || focusRequest.current === focus.requestId) return;
    focusRequest.current = focus.requestId;
    focusPending.current = focus;
    setState('active'); setQuery(''); setAppliedQuery('');
    void open(focus.locator.noteId);
  }, [active, focus, busy]);
  useEffect(() => {
    const pending = focusPending.current;
    if (!active || busy || !pending || editor?.note?.id !== pending.locator.noteId) return;
    focusPending.current = undefined;
    if (isDirty(editor)) { setReceipt('你刚写下的内容还在，先接着这一版。'); return; }
    if (editor.note.revision !== pending.locator.revision) { setReceipt('这一页后来改过，这里是现在的内容。'); return; }
    const field = pending.locator.field === 'title' ? 'input.notes-title' : 'textarea.notes-body';
    const control = host.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>(field);
    if (!control) return;
    const text = pending.locator.field === 'title' ? editor.title : editor.body;
    const points = Array.from(text);
    const start = points.slice(0, pending.locator.offset).join('').length;
    const end = points.slice(0, pending.locator.end).join('').length;
    revealNoteMatch(control, start, end);
  }, [editor, active, busy]);
  useEffect(() => {
    if (!active || busy || !editor?.note || isDirty(editor) || focusPending.current) return;
    const id = editor.note.id,
      revision = editor.note.revision,
      token = ++request.current;
    setBusy(true);
    void readAll(id)
      .then((note) => {
        if (mounted.current && token === request.current && note.revision !== revision) {
          setEditor(editable(note));
          resetFeedback();
        }
      })
      .catch((cause) => {
        if (mounted.current && token === request.current) setError(uiError(cause));
      })
      .finally(() => {
        if (mounted.current && token === request.current) setBusy(false);
      });
  }, [active]);

  function retainDraft() {
    if (editor && isDirty(editor)) drafts.current.set(keyOf(editor), editor);
    else if (editor) drafts.current.delete(keyOf(editor));
    setDraftCount(drafts.current.size);
  }
  function resetFeedback() {
    setError('');
    setReceipt('');
    setConflict(undefined);
    setUndoRevision(undefined);
    setHistory(undefined);
    setVersion(undefined);
    setClosing(false);
  }
  async function readAll(id: string, revision?: number) {
    const first = await bridge.notesRead({ id, revision });
    let body = first.body,
      page = first;
    while (page.hasMore) {
      page = await bridge.notesRead({
        id,
        revision: first.note.revision,
        offset: page.end,
      });
      body += page.body;
    }
    return { ...first.note, body };
  }
  async function open(id: string) {
    if (busy) return;
    retainDraft();
    resetFeedback();
    const token = ++request.current;
    const draft = drafts.current.get(id);
    if (draft) {
      setEditor(draft);
      return;
    }
    setBusy(true);
    try {
      const note = await readAll(id);
      if (mounted.current && token === request.current) setEditor(editable(note));
    } catch (cause) {
      if (mounted.current && token === request.current) setError(uiError(cause));
    } finally {
      if (mounted.current && token === request.current) setBusy(false);
    }
  }
  function newNote() {
    if (busy) return;
    retainDraft();
    resetFeedback();
    ++request.current;
    setState('active');
    setEditor(drafts.current.get('new') || fresh());
  }
  function changeDraft(change: Partial<Pick<Editor, 'title' | 'body'>>) {
    if (!editor) return;
    const next = { ...editor, ...change };
    setEditor(next);
    setReceipt('');
    setUndoRevision(undefined);
    if (isDirty(next)) drafts.current.set(keyOf(next), next);
    else drafts.current.delete(keyOf(next));
    setDraftCount(drafts.current.size);
  }
  function acceptResult(result: NoteMutation) {
    if (result.status === 'conflict') {
      setConflict(result.current);
      return false;
    }
    if (editor) drafts.current.delete(keyOf(editor));
    setDraftCount(drafts.current.size);
    setEditor(editable(result.note));
    setConflict(undefined);
    setUndoRevision(result.previousRevision);
    setVersion(undefined);
    setHistory(undefined);
    return true;
  }
  async function save(useCurrent = false) {
    if (!editor || busy || deleted) return false;
    setBusy(true);
    setError('');
    try {
      const result = editor.note
        ? await bridge.notesUpdate({
            id: editor.note.id,
            expectedRevision: useCurrent && conflict ? conflict.revision : editor.note.revision,
            title: editor.title,
            body: editor.body,
          })
        : await bridge.notesCreate({ title: editor.title, body: editor.body });
      const saved = acceptResult(result);
      if (saved) {
        setReceipt('保存好了');
        await loadList();
      }
      return saved;
    } catch (cause) {
      setError(uiError(cause));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function mutate(kind: 'state' | 'undo', target: 'active' | 'deleted' | number) {
    if (!editor?.note || busy) return;
    setBusy(true);
    setError('');
    try {
      const input = {
        id: editor.note.id,
        expectedRevision: editor.note.revision,
      };
      const result =
        kind === 'state'
          ? await bridge.notesChangeState({
              ...input,
              state: target as 'active' | 'deleted',
            })
          : await bridge.notesUndo({
              ...input,
              targetRevision: target as number,
            });
      if (acceptResult(result)) {
        setReceipt(
          kind === 'undo'
            ? '这一版回来了'
            : target === 'deleted'
              ? '先收在这里，随时可以放回去'
              : '笔记回来了',
        );
        await loadList();
      }
    } catch (cause) {
      setError(uiError(cause));
    } finally {
      setBusy(false);
    }
  }
  async function showHistory(append = false) {
    if (!editor?.note || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await bridge.notesHistory({
        id: editor.note.id,
        offset: append ? history?.items.length || 0 : 0,
      });
      setHistory((current) =>
        append && current ? { ...result, items: [...current.items, ...result.items] } : result,
      );
    } catch (cause) {
      setError(uiError(cause));
    } finally {
      setBusy(false);
    }
  }
  async function viewVersion(revision: number) {
    if (!editor?.note || busy) return;
    setBusy(true);
    setError('');
    try {
      setVersion(await readAll(editor.note.id, revision));
    } catch (cause) {
      setError(uiError(cause));
    } finally {
      setBusy(false);
    }
  }
  function close() {
    retainDraft();
    if (dirty || drafts.current.size) setClosing(true);
    else onClose();
  }
  const date = (value: string) => formatDateTime(value, timeZone);
  const hasContent = !!editor?.title.trim() || !!editor?.body.trim();
  return (
    <div className="notes-host" hidden={!active} ref={host}>
      <NotesFrame embedded={embedded} onClose={close}>
        <div className="notes-toolbar">
          <form
            className="notes-search"
            onSubmit={(event) => {
              event.preventDefault();
              if (!busy) setAppliedQuery(query);
            }}
          >
            <Search size={17} aria-hidden="true" />
            <input
              aria-label="搜索笔记"
              placeholder="找一段写过的话"
              value={query}
              disabled={busy}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button className="text-button" disabled={loading || busy}>
              查找
            </button>
          </form>
          <button className="primary-button notes-new" onClick={newNote} disabled={busy}>
            <Plus size={17} />
            写一页
          </button>
        </div>
        {closing && (
          <div className="notes-leave" role="alert">
            <span>刚写的字还没保存，要先留下吗？</span>
            <div className="notes-inline-actions">
              {dirty && (
                <button
                  className="primary-button"
                  disabled={busy || !hasContent || !!conflict}
                  onClick={() =>
                    void save().then((saved) => {
                      if (saved && drafts.current.size === 0) onClose();
                    })
                  }
                >
                  保存这一页
                </button>
              )}
              <button className="text-button" disabled={busy} onClick={() => setClosing(false)}>
                再写一会儿
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  drafts.current.clear();
                  setDraftCount(0);
                  setEditor(editor?.note ? editable(editor.note) : undefined);
                  resetFeedback();
                  onClose();
                }}
              >
                不保留这些改动，返回
              </button>
            </div>
          </div>
        )}
        <div className="notes-workspace" aria-busy={busy}>
          <aside className="notes-index" aria-label="笔记列表">
            <div className="notes-tabs" role="tablist" aria-label="笔记范围">
              <button
                role="tab"
                aria-selected={state === 'active'}
                disabled={busy}
                onClick={() => setState('active')}
              >
                写下的
              </button>
              <button
                role="tab"
                aria-label="回收站"
                aria-selected={state === 'deleted'}
                disabled={busy}
                onClick={() => setState('deleted')}
              >
                最近收起的
              </button>
            </div>
            {loading && !list.items.length && (
              <p className="notes-empty" role="status">
                翻开笔记…
              </p>
            )}
            {!loading && !list.items.length && (
              <p className="notes-empty">
                {appliedQuery
                  ? '这次没找到，换几个字试试。'
                  : state === 'deleted'
                    ? '这里还没有收起的笔记。'
                    : '想到什么，就从一页开始。'}
              </p>
            )}
            <div className="notes-list">
              {list.items.map((note) => (
                <button
                  className={`notes-entry ${editor?.note?.id === note.id ? 'is-current' : ''}`}
                  key={note.id}
                  disabled={busy}
                  onClick={() => void open(note.id)}
                  aria-current={editor?.note?.id === note.id ? 'true' : undefined}
                >
                  <strong>{note.title || '没有标题的一页'}</strong>
                  {note.preview && <span className="notes-preview">{note.preview}</span>}
                  <small>
                    {drafts.current.has(note.id) ? '还有没保存的字' : date(note.updatedAt)}
                  </small>
                </button>
              ))}
            </div>
            {list.hasMore && (
              <button
                className="text-button notes-more"
                disabled={loading || busy}
                onClick={() => void loadList(state, appliedQuery, true)}
              >
                再翻一些
              </button>
            )}
            {draftCount > 0 && drafts.current.has('new') && editor?.note && (
              <button className="text-button notes-more" disabled={busy} onClick={newNote}>
                接着写刚才那一页
              </button>
            )}
          </aside>
          <section className="notes-reading-area" aria-label={editor?.note?.title || '笔记正文'}>
            {!editor ? (
              <div className="notes-paper notes-start">
                <div>
                  <p className="notes-start-title">留一点位置，给你的想法。</p>
                  <p>一句话也好，慢慢写也好。</p>
                  <button className="text-button" disabled={busy} onClick={newNote}>
                    <Plus size={17} />
                    写下第一句
                  </button>
                </div>
              </div>
            ) : (
              <div
                className={`notes-reader-grid ${history || conflict ? 'has-companion-panel' : ''}`}
              >
                <div className="notes-paper">
                  <div className="notes-document-meta">
                    <span>
                      {deleted
                        ? '收在这里，随时可以放回笔记'
                        : dirty
                          ? '刚写的字还没保存'
                          : editor.note
                            ? date(editor.note.updatedAt)
                            : '新的一页'}
                    </span>
                    {editor.note && (
                      <button
                        className="text-button"
                        disabled={busy}
                        aria-label="查看历史版本"
                        onClick={() =>
                          history
                            ? (setHistory(undefined), setVersion(undefined))
                            : void showHistory()
                        }
                        aria-expanded={!!history}
                      >
                        <History size={15} />
                        以前写下的
                      </button>
                    )}
                  </div>
                  <form
                    className="notes-editor"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void save();
                    }}
                  >
                    <label className="notes-title-label">
                      <span className="sr-only">笔记标题</span>
                      <input
                        className="notes-title"
                        aria-label="笔记标题"
                        placeholder="给这一页起个名字"
                        value={editor.title}
                        maxLength={NOTE_LIMITS.title}
                        readOnly={deleted || busy}
                        onChange={(event) => changeDraft({ title: event.target.value })}
                      />
                    </label>
                    <label className="notes-body-label">
                      <span className="sr-only">笔记正文</span>
                      <textarea
                        className="notes-body"
                        aria-label="笔记正文"
                        placeholder="把眼前的想法，慢慢写在这里…"
                        value={editor.body}
                        maxLength={NOTE_LIMITS.body}
                        readOnly={deleted || busy}
                        onChange={(event) => changeDraft({ body: event.target.value })}
                      />
                    </label>
                    <div className="notes-editor-actions">
                      {deleted ? (
                        <button
                          className="primary-button"
                          type="button"
                          disabled={busy}
                          onClick={() => void mutate('state', 'active')}
                        >
                          <RotateCcw size={16} />
                          放回笔记
                        </button>
                      ) : (
                        <button
                          className="primary-button"
                          type="submit"
                          disabled={busy || !hasContent || !dirty || !!conflict}
                        >
                          保存笔记
                        </button>
                      )}
                      {(dirty || draftCount > 0) && (
                        <button
                          className="text-button notes-draft-action"
                          type="button"
                          disabled={busy}
                          onClick={close}
                        >
                          先放下
                        </button>
                      )}
                      {editor.note && !deleted && (
                        <button
                          className="text-button notes-delete"
                          type="button"
                          disabled={busy || dirty}
                          title={dirty ? '先保存刚写的字，再收起这页' : '收进回收站，之后可以放回'}
                          aria-label="移入回收站"
                          onClick={() => void mutate('state', 'deleted')}
                        >
                          <Trash2 size={15} />
                          收起这页
                        </button>
                      )}
                      {receipt && (
                        <span className="notes-receipt" role="status">
                          <Check size={15} />
                          {receipt}
                          {undoRevision && !dirty && (
                            <button
                              className="text-button"
                              type="button"
                              disabled={busy}
                              onClick={() => void mutate('undo', undoRevision)}
                            >
                              撤销
                            </button>
                          )}
                        </span>
                      )}
                    </div>
                  </form>
                </div>
                {(history || conflict) && (
                  <aside
                    className="notes-side"
                    aria-label={conflict ? '一起看看不同的改动' : '以前写下的'}
                  >
                    {conflict && (
                      <section className="notes-conflict" role="alert">
                        <header>
                          <h3>这一页有了新的改动</h3>
                        </header>
                        <p>你刚写的还在。看看另一份内容，再决定留下哪一份。</p>
                        <div className="notes-conflict-compare">
                          <details open>
                            <summary>你刚写的</summary>
                            <h4>{editor.title || '没有标题的一页'}</h4>
                            <pre>{editor.body}</pre>
                          </details>
                          <details open>
                            <summary>
                              新的内容
                              {conflict.state === 'deleted' ? ' · 已收起' : ''}
                            </summary>
                            <h4>{conflict.title || '没有标题的一页'}</h4>
                            <pre>{conflict.body}</pre>
                          </details>
                        </div>
                        <div className="notes-side-actions">
                          {conflict.state === 'active' && (
                            <button
                              className="primary-button"
                              disabled={busy || !hasContent}
                              onClick={() => void save(true)}
                            >
                              保留我的文字并保存
                            </button>
                          )}
                          <button
                            className="text-button"
                            disabled={busy}
                            onClick={() => {
                              setEditor(editable(conflict));
                              drafts.current.delete(conflict.id);
                              setConflict(undefined);
                              setDraftCount(drafts.current.size);
                            }}
                          >
                            采用新的内容
                          </button>
                        </div>
                      </section>
                    )}
                    {history && (
                      <section className="notes-history">
                        <header>
                          <h3>以前写下的</h3>
                          <IconButton
                            label="收起历史版本"
                            onClick={() => {
                              setHistory(undefined);
                              setVersion(undefined);
                            }}
                          >
                            <X size={17} />
                          </IconButton>
                        </header>
                        {version ? (
                          <>
                            <button
                              className="text-button notes-history-back"
                              onClick={() => setVersion(undefined)}
                            >
                              <ChevronLeft size={15} />
                              看看其他版本
                            </button>
                            <div className="notes-version-copy">
                              <p>{date(version.updatedAt)}</p>
                              <h4>{version.title || '没有标题的一页'}</h4>
                              <pre>{version.body || '这一页还没有正文。'}</pre>
                            </div>
                            <div className="notes-side-actions">
                              <button
                                className="primary-button"
                                disabled={
                                  busy || dirty || version.revision === editor.note?.revision
                                }
                                onClick={() => void mutate('undo', version.revision)}
                              >
                                {version.revision === editor.note?.revision
                                  ? '正用着这一版'
                                  : '用这个版本'}
                              </button>
                              {dirty && <p>先保存刚写的字，再换回以前的版本。</p>}
                              <button
                                className="text-button"
                                onClick={() => {
                                  setHistory(undefined);
                                  setVersion(undefined);
                                }}
                              >
                                回到现在
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="notes-history-list">
                              {history.items.map((item) => (
                                <button
                                  className="notes-history-row"
                                  key={item.revision}
                                  disabled={busy}
                                  onClick={() => void viewVersion(item.revision)}
                                >
                                  <span>
                                    <time>{date(item.updatedAt)}</time>
                                    <small>
                                      {
                                        {
                                          create: '写下这一页',
                                          edit: '改了几笔',
                                          delete: '收起这一页',
                                          restore: '放回笔记',
                                          undo: '换回以前的版本',
                                        }[item.operation]
                                      }
                                      {item.revision === editor.note?.revision ? ' · 正在用' : ''}
                                    </small>
                                  </span>
                                  <ChevronRight size={15} />
                                </button>
                              ))}
                            </div>
                            {history.hasMore && (
                              <button
                                className="text-button notes-more"
                                disabled={busy}
                                onClick={() => void showHistory(true)}
                              >
                                再往前翻
                              </button>
                            )}
                          </>
                        )}
                      </section>
                    )}
                  </aside>
                )}
              </div>
            )}
            {error && (
              <div className="inline-problem notes-error" role="alert">
                <span>{error}</span>
                <button className="text-button" disabled={busy} onClick={() => void loadList()}>
                  再打开笔记列表
                </button>
              </div>
            )}
          </section>
        </div>
      </NotesFrame>
    </div>
  );
}
