import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { BookOpen, Download, LoaderCircle, Upload, Undo2 } from 'lucide-react';
import type { PersonaCore, PersonaState } from '../shared/persona';
import {
  PERSONA_PRESETS,
  PERSONA_SCENARIOS,
  exportPersonaTemplate,
  importPersonaTemplate,
  personaPreset,
} from '../shared/persona';
import type { SettingsUpdate, State } from '../shared/types';
import { previewPersonaCharacterCard } from '../shared/persona-card-import';
import { Modal, uiError } from './ui';
import './persona.css';

export interface PersonaDraft {
  expectedRevision: number;
  core: PersonaCore;
  beforeReplacement?: { expectedRevision: number; core: PersonaCore };
}
type PersonaCandidate = { core: PersonaCore; origin: string; external: boolean; ignoredFields?: string[] };
export function PersonaEditor({
  persona,
  legacyGuidance,
  draft,
  onState,
  busy,
  saving,
  perform,
}: {
  persona: PersonaState;
  legacyGuidance: string;
  draft: MutableRefObject<{ persona?: PersonaDraft }>;
  onState: (state: State) => void;
  busy: boolean;
  saving: boolean;
  perform: (operation: () => Promise<void>) => Promise<void>;
}) {
  const [editor, setEditor] = useState<PersonaDraft>(
    () =>
      draft.current.persona || { expectedRevision: persona.revision, core: structuredClone(persona.core) },
  );
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean }>();
  const [scenario, setScenario] = useState<(typeof PERSONA_SCENARIOS)[number]['id']>('departure');
  const [undoRevision, setUndoRevision] = useState<number>();
  const [legacySelection, setLegacySelection] = useState('');
  const [candidate, setCandidate] = useState<PersonaCandidate>();
  const fileRef = useRef<HTMLInputElement>(null);
  const importRevision = useRef(0);
  const core = editor.core;
  const locked = pending || saving;
  const dirty = JSON.stringify(core) !== JSON.stringify(persona.core);
  const stale = editor.expectedRevision !== persona.revision;
  const selectedScene = PERSONA_SCENARIOS.find((entry) => entry.id === scenario)!;
  const response = core.examples.find((entry) => entry.scenario === scenario)?.response;
  useEffect(() => {
    if (!draft.current.persona && editor.expectedRevision !== persona.revision) {
      importRevision.current++;
      setEditor({ expectedRevision: persona.revision, core: structuredClone(persona.core) });
    }
  }, [persona, editor.expectedRevision, draft]);
  useEffect(
    () => () => {
      importRevision.current++;
    },
    [],
  );
  function replace(next: PersonaCore) {
    importRevision.current++;
    const nextEditor = { ...editor, core: next };
    setEditor(nextEditor);
    draft.current.persona = nextEditor;
    setFeedback(undefined);
  }
  function patch(value: Partial<PersonaCore>) {
    replace({ ...core, ...value });
  }
  function acceptCandidate() {
    if (!candidate || locked) return;
    importRevision.current++;
    const nextEditor: PersonaDraft = {
      expectedRevision: editor.expectedRevision,
      core: candidate.core,
      beforeReplacement: { expectedRevision: editor.expectedRevision, core: structuredClone(editor.core) },
    };
    setEditor(nextEditor); draft.current.persona = nextEditor; setCandidate(undefined);
    setFeedback({ text: '已放进编辑草稿。可以继续调整，留下约定后才会生效。' });
  }
  function restoreReplacedDraft() {
    if (!editor.beforeReplacement || locked) return;
    importRevision.current++;
    const restored = structuredClone(editor.beforeReplacement);
    setEditor(restored); draft.current.persona = restored;
    setFeedback({ text: '替换前的文字回来了，还没有改动已保存的约定。' });
  }
  function reset(next = persona) {
    importRevision.current++;
    const nextEditor = { expectedRevision: next.revision, core: structuredClone(next.core) };
    setEditor(nextEditor);
    delete draft.current.persona;
    setFeedback(undefined);
    setUndoRevision(undefined);
  }
  async function save(update: NonNullable<SettingsUpdate['personaUpdate']>) {
    if (locked) return;
    importRevision.current++;
    const submittedDraft = draft.current.persona;
    setPending(true);
    setFeedback(undefined);
    try {
      await perform(async () => {
        let next: State;
        try { next = await window.zaichang.saveSettings({ personaUpdate: update }); }
        catch (problem) {
          try { onState(await window.zaichang.state()); } catch { /* The editor keeps its own draft. */ }
          throw problem;
        }
        onState(next);
        setEditor({
          expectedRevision: next.settings.persona.revision,
          core: structuredClone(next.settings.persona.core),
        });
        if (draft.current.persona === submittedDraft) delete draft.current.persona;
        setUndoRevision(undefined);
        setFeedback({ text: 'undoRevision' in update ? '我们回到以前的约定了' : '以后就这样相处' });
      });
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="preference-section persona-editor">
      <div className="persona-heading">
        <h3 className="section-title">你喜欢的相处方式</h3>
        <span>{persona.core.name || '还没起名字'}</span>
      </div>
      <p className="persona-lede">形象可以换，相处的方式由你来写。</p>
      <div className="persona-composition">
        <div className="persona-writing">
      <div className="persona-presets" role="group" aria-label="从哪种相处方式开始">
        {PERSONA_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="persona-preset"
            aria-pressed={core.presetId === preset.id}
            disabled={locked}
            onClick={() => dirty
              ? setCandidate({ core: personaPreset(preset.id), origin: `${preset.label}预设`, external: false })
              : replace(personaPreset(preset.id))}
          >
            <strong>{preset.label}</strong>
            <span>{preset.summary}</span>
          </button>
        ))}
      </div>
      <label className="field-label">
        叫什么
        <input
          aria-label="叫什么"
          value={core.name}
          maxLength={60}
          disabled={locked}
          onChange={(event) => patch({ name: event.target.value })}
          placeholder="想到了再写也可以"
        />
      </label>
      <label className="field-label">
        你希望怎样相处
        <textarea
          aria-label="你希望怎样相处"
          value={core.description}
          maxLength={4000}
          rows={3}
          disabled={locked}
          onChange={(event) => patch({ description: event.target.value })}
          placeholder="希望怎样相处、怎样表达"
        />
      </label>
      <details className="persona-details">
        <summary>再写细一点</summary>
        <div className="persona-details-body">
          <div className="preference-fields">
            <label>
              自称
              <input
                aria-label="角色自称"
                value={core.selfReference}
                maxLength={60}
                disabled={locked}
                onChange={(event) => patch({ selfReference: event.target.value })}
                placeholder="想到了再写也可以"
              />
            </label>
            <label>
              如何称呼你
              <input
                aria-label="角色如何称呼你"
                value={core.address}
                maxLength={100}
                disabled={locked}
                onChange={(event) => patch({ address: event.target.value })}
                placeholder="想到了再写也可以"
              />
            </label>
          </div>
          <label className="field-label">
            角色中的身份或关系
            <input
              value={core.identity}
              maxLength={500}
              disabled={locked}
              onChange={(event) => patch({ identity: event.target.value })}
              placeholder="想到了再写也可以"
            />
          </label>
          <label className="field-label">
            表达方式
            <textarea
              value={core.voice}
              maxLength={1000}
              rows={2}
              disabled={locked}
              onChange={(event) => patch({ voice: event.target.value })}
              placeholder="想到了再写也可以"
            />
          </label>
          <label className="field-label">
            角色中的故事
            <textarea
              value={core.fictionalBackstory}
              maxLength={1000}
              rows={2}
              disabled={locked}
              onChange={(event) => patch({ fictionalBackstory: event.target.value })}
              placeholder="想到了再写也可以"
            />
          </label>
          {PERSONA_SCENARIOS.map((scene) => (
            <label className="field-label persona-example-field" key={scene.id}>
              {scene.label}
              <small>{scene.facts}</small>
              <textarea
                aria-label={`${scene.label}例句`}
                value={core.examples.find((example) => example.scenario === scene.id)?.response || ''}
                maxLength={500}
                rows={2}
                disabled={locked}
                onChange={(event) =>
                  patch({
                    examples: [
                      ...core.examples.filter((example) => example.scenario !== scene.id),
                      ...(event.target.value ? [{ scenario: scene.id, response: event.target.value }] : []),
                    ],
                  })
                }
                placeholder="想到了再写也可以"
              />
            </label>
          ))}
        </div>
      </details>
      <div className="field-buttons">
        <button
          className="primary-button"
          disabled={locked || busy || !dirty || stale}
          onClick={() => void save({ expectedRevision: editor.expectedRevision, core })}
        >
          {locked && <LoaderCircle size={14} className="spin" />}留下这些约定
        </button>
        {(dirty || stale) && (
          <button className="text-button" disabled={locked} onClick={() => reset()}>
            先不改了
          </button>
        )}
        {dirty && !stale && <small className="setting-hint">这次的想法还没留下</small>}
      </div>
      {stale && (
        <div className="persona-conflict" role="alert">
          <p>这里已经有了新的约定（{persona.core.name || '在场'}）。你写的文字还在；继续使用这份草稿，下次保存会替换当前约定。</p>
          <button type="button" className="text-button" disabled={locked} onClick={() => { const next = { ...editor, expectedRevision: persona.revision }; setEditor(next); draft.current.persona = next; setFeedback({ text: '草稿保留着。检查后再保存，就会成为新的约定。' }); }}>继续使用这份草稿</button>
        </div>
      )}
      {feedback && (
        <p
          className={`inline-status ${feedback.error ? 'error' : ''}`}
          role={feedback.error ? 'alert' : 'status'}
        >
          {feedback.text}
        </p>
      )}
      {editor.beforeReplacement && <button className="text-button persona-draft-restore" disabled={locked} onClick={restoreReplacedDraft}><Undo2 size={13} />恢复替换前的草稿</button>}
        </div>
        <aside className="persona-listening">
      <div className="persona-preview">
        <div className="persona-preview-heading">
          <strong>试着这样说</strong>
          <select
            aria-label="角色预览场景"
            value={scenario}
            onChange={(event) => setScenario(event.target.value as typeof scenario)}
          >
            {PERSONA_SCENARIOS.map((scene) => (
              <option key={scene.id} value={scene.id}>
                {scene.label}
              </option>
            ))}
          </select>
        </div>
        <p className="persona-scene">{selectedScene.facts}</p>
        <blockquote>{response || '这时，你希望我怎样回应？可以在左边写一句。'}</blockquote>
        <small>这里展示你写下的例句，方便一起调整语气。</small>
      </div>
      <div className="persona-import-entry"><button className="text-button" disabled={locked} onClick={() => fileRef.current?.click()}><Upload size={15} />带来一份角色设定</button><small>支持在场设置和 Character Card V2 的 JSON 文件。</small></div>
      <details className="persona-details persona-manage">
        <summary>以前的约定与随身带走</summary>
        <div className="persona-details-body">
          {persona.history.length > 0 && (
            <div className="persona-version-row">
              <label className="field-label">
                以前怎样相处
                <select
                  aria-label="角色历史版本"
                  value={undoRevision ?? ''}
                  disabled={locked}
                  onChange={(event) =>
                    setUndoRevision(event.target.value ? Number(event.target.value) : undefined)
                  }
                >
                  <option value="">选一份以前的约定</option>
                  {[...persona.history].reverse().map((version) => (
                    <option key={version.revision} value={version.revision}>
                      第 {version.revision} 次约定 · {version.core.name || '还没起名字'}
                      {version.savedAt
                        ? ` · ${new Date(version.savedAt).toLocaleDateString('zh-CN')}`
                        : ' · 最初的约定'}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="subtle-button"
                disabled={locked || busy || dirty || undoRevision === undefined}
                onClick={() =>
                  undoRevision !== undefined &&
                  void save({ expectedRevision: persona.revision, undoRevision })
                }
              >
                <Undo2 size={14} />
                回到这份约定
              </button>
            </div>
          )}
          <div className="field-buttons">
            <button
              className="text-button"
              disabled={locked}
              onClick={() => {
                const blob = new Blob([exportPersonaTemplate(core)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = 'zaichang-persona.json';
                anchor.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                setFeedback({ text: '这份相处设置已带走，私人补充和记忆仍留在这里' });
              }}
            >
              <Download size={14} />
              带走这份设置
            </button>
          </div>
          <input
            className="sr-only"
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            aria-label="放入我的设置文件"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              const importingRevision = ++importRevision.current;
              const beforeImport = draft.current.persona;
              try {
                if (file.size > 600_000) throw new Error('这份设置文件太大了，请选一份 600 KB 以内的 JSON 文件。');
                const text = await file.text();
                let imported: PersonaCandidate;
                const format = JSON.parse(text)?.format;
                if (format === 'zaichang-persona-template') imported = { core: importPersonaTemplate(text), origin: file.name, external: false };
                else {
                  const preview = previewPersonaCharacterCard(text);
                  imported = { core: preview.core, origin: file.name, external: true, ignoredFields: preview.ignoredFields };
                }
                if (importRevision.current !== importingRevision || draft.current.persona !== beforeImport)
                  return;
                setCandidate(imported);
              } catch (error) {
                if (importRevision.current !== importingRevision) return;
                setFeedback({ text: uiError(error), error: true });
              }
            }}
          />
          {legacyGuidance && (
            <details className="persona-legacy">
              <summary>从以前写的话里挑一段</summary>
              <textarea
                aria-label="原私人补充说明"
                readOnly
                value={legacyGuidance}
                rows={4}
                onSelect={(event) => {
                  const target = event.currentTarget;
                  setLegacySelection(target.value.slice(target.selectionStart, target.selectionEnd));
                }}
              />
              <button
                className="text-button"
                disabled={!legacySelection || locked}
                onClick={() => {
                  patch({ description: legacySelection });
                  setFeedback({ text: '选中文字已放入你希望怎样相处，保存后作为角色使用' });
                }}
              >
                将选中文字用作你希望怎样相处
              </button>
            </details>
          )}
        </div>
      </details>
        </aside>
      </div>
      {candidate && <Modal title="先看看，再决定" onClose={() => setCandidate(undefined)} className="persona-import-dialog">
        <div className="persona-import-body">
        <div className="persona-import-intro"><span className="persona-import-mark"><BookOpen size={25} /></span><div><h3>{candidate.core.name || '还没起名字'}</h3><p>{candidate.origin}</p></div></div>
        <p className="persona-import-lede">这份设定还没有生效。放进草稿后，你可以改成更喜欢的样子。</p>
        <div className="persona-import-content">
          <section><h4>怎样相处</h4><p>{candidate.core.description || '这份设定还没有写性格，可以在草稿里补上。'}</p></section>
          {candidate.core.voice && <section><h4>说话的方式</h4><p>{candidate.core.voice}</p></section>}
          {candidate.core.fictionalBackstory && <section><h4>虚构的背景</h4><p>{candidate.core.fictionalBackstory}</p></section>}
        </div>
        {candidate.external && <p className="persona-import-note">这里只带入名字、性格与虚构背景。原卡的开场白、世界书和自动执行内容不会加入对话。</p>}
        {dirty && <p className="persona-import-note">你正在写的草稿会先留一份，替换后仍可恢复。</p>}
        <div className="persona-import-actions"><button type="button" className="primary-button" disabled={locked} onClick={acceptCandidate}>{dirty ? '替换编辑草稿' : '放进编辑草稿'}</button><button type="button" className="text-button" onClick={() => setCandidate(undefined)}>先不换</button></div>
        </div>
      </Modal>}
    </section>
  );
}
