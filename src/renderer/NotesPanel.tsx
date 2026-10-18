import { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, History, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import {
  NOTE_LIMITS,
  type NoteDocument,
  type NoteHistory,
  type NoteList,
  type NoteMutation,
  type NotesBridge,
} from '../shared/notes';
import { PagePanel, uiError } from './ui';
import { DEFAULT_TIME_ZONE, formatDateTime } from './time';
import './notes.css';

type Editor = { note?: NoteDocument; title: string; body: string };
const fresh = (): Editor => ({ title: '', body: '' });
const keyOf = (editor: Editor) => editor.note?.id || 'new';
const isDirty = (editor?: Editor) =>
  !!editor &&
  (editor.note
    ? editor.title !== editor.note.title || editor.body !== editor.note.body
    : !!editor.title || !!editor.body);
const editable = (note: NoteDocument): Editor => ({ note, title: note.title, body: note.body });

/** A separate notebook. Saving here does not create memories or arrangements. */
export function NotesPanel({
  onClose,
  onUnsavedChange,
  active = true,
  bridge = window.zaichang as unknown as NotesBridge,
  timeZone = DEFAULT_TIME_ZONE,
}: {
  onClose: () => void;
  onUnsavedChange?: (unsaved: boolean) => void;
  active?: boolean;
  bridge?: NotesBridge;
  timeZone?: string;
}) {
  const [list, setList] = useState<NoteList>({ items: [], total: 0, offset: 0, hasMore: false });
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
    if (active) host.current?.querySelector<HTMLHeadingElement>('h1')?.focus({ preventScroll: true });
  }, [active]);
  useEffect(() => {
    onUnsavedChange?.(dirty || draftCount > 0);
  }, [dirty, draftCount, onUnsavedChange]);
  useEffect(() => () => unsavedCallback.current?.(false), []);

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
      setList((current) => (append ? { ...result, items: [...current.items, ...result.items] } : result));
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
    if (!active || busy || !editor?.note || isDirty(editor)) return;
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
      page = await bridge.notesRead({ id, revision: first.note.revision, offset: page.end });
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
        setReceipt('已保存');
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
      const input = { id: editor.note.id, expectedRevision: editor.note.revision };
      const result =
        kind === 'state'
          ? await bridge.notesChangeState({ ...input, state: target as 'active' | 'deleted' })
          : await bridge.notesUndo({ ...input, targetRevision: target as number });
      if (acceptResult(result)) {
        setReceipt(kind === 'undo' ? '已恢复这个版本' : target === 'deleted' ? '已移入回收站' : '已恢复笔记');
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
      <PagePanel title="记事本" onClose={close} className="notes-page">
        <div className="notes-toolbar">
          <form
            className="notes-search"
            onSubmit={(event) => {
              event.preventDefault();
              if (!busy) setAppliedQuery(query);
            }}
          >
            <Search size={16} aria-hidden="true" />
            <input
              aria-label="搜索笔记"
              placeholder="搜索笔记"
              value={query}
              disabled={busy}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button className="text-button" disabled={loading || busy}>
              搜索
            </button>
          </form>
          <button className="primary-button" onClick={newNote} disabled={busy}>
            <Plus size={16} />
            新笔记
          </button>
        </div>
        {closing && (
          <div className="notes-leave" role="alert">
            <span>还有未保存的笔记。</span>
            {dirty && (
              <button
                className="text-button"
                disabled={busy || !hasContent || !!conflict}
                onClick={() =>
                  void save().then((saved) => {
                    if (saved && drafts.current.size === 0) onClose();
                  })
                }
              >
                保存当前笔记
              </button>
            )}
            <button className="text-button" disabled={busy} onClick={() => setClosing(false)}>
              继续编辑
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
              放弃未保存内容并返回
            </button>
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
                笔记
              </button>
              <button
                role="tab"
                aria-selected={state === 'deleted'}
                disabled={busy}
                onClick={() => setState('deleted')}
              >
                回收站
              </button>
            </div>
            {loading && !list.items.length ? (
              <p className="notes-empty" role="status">
                正在读取…
              </p>
            ) : null}
            {!loading && !list.items.length && (
              <p className="notes-empty">
                {appliedQuery ? '没有找到笔记' : state === 'deleted' ? '回收站为空' : '还没有笔记'}
              </p>
            )}
            {list.items.map((note) => (
              <button
                className={`notes-entry ${editor?.note?.id === note.id ? 'is-current' : ''}`}
                key={note.id}
                disabled={busy}
                onClick={() => void open(note.id)}
                aria-current={editor?.note?.id === note.id ? 'true' : undefined}
              >
                <strong>{note.title || '未命名笔记'}</strong>
                {note.preview && <span className="notes-preview">{note.preview}</span>}
                <small>{drafts.current.has(note.id) ? '未保存' : date(note.updatedAt)}</small>
              </button>
            ))}
            {list.hasMore && (
              <button
                className="text-button notes-more"
                disabled={loading || busy}
                onClick={() => void loadList(state, appliedQuery, true)}
              >
                更多笔记
              </button>
            )}
            {draftCount > 0 && !editor?.note && drafts.current.has('new') && (
              <button className="text-button notes-more" disabled={busy} onClick={newNote}>
                继续未保存的新笔记
              </button>
            )}
          </aside>
          <section className="notes-paper" aria-label={editor?.note?.title || '笔记正文'}>
            {!editor ? (
              <div className="notes-start">
                <button className="text-button" disabled={busy} onClick={newNote}>
                  <Plus size={17} />
                  写一条笔记
                </button>
              </div>
            ) : (
              <>
                <div className="notes-document-meta">
                  <span>
                    {deleted
                      ? '回收站'
                      : dirty
                        ? '未保存'
                        : editor.note
                          ? date(editor.note.updatedAt)
                          : '新笔记'}
                  </span>
                  {editor.note && (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() =>
                        history ? (setHistory(undefined), setVersion(undefined)) : void showHistory()
                      }
                      aria-expanded={!!history}
                    >
                      <History size={14} />
                      历史版本
                    </button>
                  )}
                </div>
                {conflict && (
                  <div className="notes-conflict" role="alert">
                    <p>这条笔记已有新修改。你输入的内容仍保留。</p>
                    <details>
                      <summary>查看最新内容</summary>
                      <h3>{conflict.title || '未命名笔记'}</h3>
                      <pre>{conflict.body}</pre>
                    </details>
                    <div className="field-buttons">
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
                        采用最新内容
                      </button>
                      {conflict.state === 'active' && (
                        <button
                          className="text-button"
                          disabled={busy || !hasContent}
                          onClick={() => void save(true)}
                        >
                          保留我的修改并保存
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {history && (
                  <div className="notes-history">
                    {version ? (
                      <>
                        <button className="text-button" onClick={() => setVersion(undefined)}>
                          <ChevronLeft size={14} />
                          返回版本列表
                        </button>
                        <h3>{version.title || '未命名笔记'}</h3>
                        <p>{date(version.updatedAt)}</p>
                        <pre>{version.body}</pre>
                        <button
                          className="text-button"
                          disabled={busy || dirty || version.revision === editor.note?.revision}
                          onClick={() => void mutate('undo', version.revision)}
                        >
                          恢复这个版本
                        </button>
                        {dirty && <p>先保存当前修改，再恢复历史版本。</p>}
                      </>
                    ) : (
                      <>
                        {history.items.map((item) => (
                          <button
                            className="notes-history-row"
                            key={item.revision}
                            disabled={busy}
                            onClick={() => void viewVersion(item.revision)}
                          >
                            <span>{date(item.updatedAt)}</span>
                            <span>
                              {
                                {
                                  create: '创建',
                                  edit: '修改',
                                  delete: '移入回收站',
                                  restore: '恢复',
                                  undo: '恢复版本',
                                }[item.operation]
                              }
                              {item.revision === editor.note?.revision ? ' · 当前' : ''}
                            </span>
                          </button>
                        ))}
                        {history.hasMore && (
                          <button
                            className="text-button"
                            disabled={busy}
                            onClick={() => void showHistory(true)}
                          >
                            更早版本
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
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
                      placeholder="未命名笔记"
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
                      placeholder="记下眼前的想法…"
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
                        <RotateCcw size={15} />
                        恢复笔记
                      </button>
                    ) : (
                      <button
                        className="primary-button"
                        type="submit"
                        disabled={busy || !hasContent || !dirty || !!conflict}
                      >
                        {busy ? '正在保存…' : '保存笔记'}
                      </button>
                    )}
                    {editor.note && !deleted && (
                      <button
                        className="text-button notes-delete"
                        type="button"
                        disabled={busy || dirty}
                        onClick={() => void mutate('state', 'deleted')}
                      >
                        <Trash2 size={14} />
                        移入回收站
                      </button>
                    )}
                    {receipt && (
                      <span className="notes-receipt" role="status">
                        <Check size={14} />
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
              </>
            )}
            {error && (
              <div className="inline-problem notes-error" role="alert">
                {error}
                <button className="text-button" disabled={busy} onClick={() => void loadList()}>
                  刷新列表
                </button>
              </div>
            )}
          </section>
        </div>
      </PagePanel>
    </div>
  );
}
