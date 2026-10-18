import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { Download, LoaderCircle, Upload, Undo2 } from 'lucide-react';
import type { PersonaCore, PersonaState } from '../shared/persona';
import {
  PERSONA_PRESETS,
  PERSONA_SCENARIOS,
  exportPersonaTemplate,
  importPersonaTemplate,
  personaPreset,
} from '../shared/persona';
import type { SettingsUpdate, State } from '../shared/types';
import { uiError } from './ui';
import './persona.css';

export interface PersonaDraft {
  expectedRevision: number;
  core: PersonaCore;
}
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
    const nextEditor = { expectedRevision: editor.expectedRevision, core: next };
    setEditor(nextEditor);
    draft.current.persona = nextEditor;
    setFeedback(undefined);
  }
  function patch(value: Partial<PersonaCore>) {
    replace({ ...core, ...value });
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
        const next = await window.zaichang.saveSettings({ personaUpdate: update });
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
            onClick={() => replace(personaPreset(preset.id))}
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
        <p className="inline-status error" role="alert">
          这里已经有了新的约定。你写的文字还在，可以先复制，再回到现在的约定继续改。
        </p>
      )}
      {feedback && (
        <p
          className={`inline-status ${feedback.error ? 'error' : ''}`}
          role={feedback.error ? 'alert' : 'status'}
        >
          {feedback.text}
        </p>
      )}
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
            <button className="text-button" disabled={locked} onClick={() => fileRef.current?.click()}>
              <Upload size={14} />
              放入我的设置
            </button>
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
                if (file.size > 160_000) throw new Error('这份设置文件太大了，请选一份 160 KB 以内的 JSON 文件。');
                const imported = importPersonaTemplate(await file.text());
                if (importRevision.current !== importingRevision || draft.current.persona !== beforeImport)
                  return;
                replace(imported);
                setFeedback({ text: '这份设置放进来了。看看合不合心意，再留下。' });
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
    </section>
  );
}
