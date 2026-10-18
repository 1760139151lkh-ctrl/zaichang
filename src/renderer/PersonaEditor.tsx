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
        setFeedback({ text: 'undoRevision' in update ? '已恢复所选角色版本' : '角色已保存' });
      });
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="preference-section persona-editor">
      <div className="persona-heading">
        <h3 className="section-title">助理角色</h3>
        <span>{persona.core.name || '尚未命名'}</span>
      </div>
      <div className="persona-presets" role="group" aria-label="选择角色起点">
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
        角色名字
        <input
          aria-label="角色名字"
          value={core.name}
          maxLength={60}
          disabled={locked}
          onChange={(event) => patch({ name: event.target.value })}
          placeholder="待设置"
        />
      </label>
      <label className="field-label">
        角色描述
        <textarea
          aria-label="角色描述"
          value={core.description}
          maxLength={4000}
          rows={3}
          disabled={locked}
          onChange={(event) => patch({ description: event.target.value })}
          placeholder="希望怎样相处、怎样表达"
        />
      </label>
      <details className="persona-details">
        <summary>角色细节与例句</summary>
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
                placeholder="待设置"
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
                placeholder="待设置"
              />
            </label>
          </div>
          <label className="field-label">
            虚构身份或关系
            <input
              value={core.identity}
              maxLength={500}
              disabled={locked}
              onChange={(event) => patch({ identity: event.target.value })}
              placeholder="待设置"
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
              placeholder="待设置"
            />
          </label>
          <label className="field-label">
            虚构背景
            <textarea
              value={core.fictionalBackstory}
              maxLength={1000}
              rows={2}
              disabled={locked}
              onChange={(event) => patch({ fictionalBackstory: event.target.value })}
              placeholder="待设置"
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
                placeholder="待设置"
              />
            </label>
          ))}
        </div>
      </details>
      <div className="persona-preview">
        <div className="persona-preview-heading">
          <strong>表达预览</strong>
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
        <blockquote>{response || '这个场景还没有例句。'}</blockquote>
        <small>角色例句，不代表实际操作结果</small>
      </div>
      <div className="field-buttons">
        <button
          className="primary-button"
          disabled={locked || busy || !dirty || stale}
          onClick={() => void save({ expectedRevision: editor.expectedRevision, core })}
        >
          {locked && <LoaderCircle size={14} className="spin" />}保存角色
        </button>
        {(dirty || stale) && (
          <button className="text-button" disabled={locked} onClick={() => reset()}>
            放弃修改
          </button>
        )}
        {dirty && !stale && <small className="setting-hint">未保存</small>}
      </div>
      {stale && (
        <p className="inline-status error" role="alert">
          角色已在别处更新，请放弃当前修改后重新编辑。
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
      <details className="persona-details persona-manage">
        <summary>版本与角色模板</summary>
        <div className="persona-details-body">
          {persona.history.length > 0 && (
            <div className="persona-version-row">
              <label className="field-label">
                恢复早先版本
                <select
                  aria-label="角色历史版本"
                  value={undoRevision ?? ''}
                  disabled={locked}
                  onChange={(event) =>
                    setUndoRevision(event.target.value ? Number(event.target.value) : undefined)
                  }
                >
                  <option value="">选择版本</option>
                  {[...persona.history].reverse().map((version) => (
                    <option key={version.revision} value={version.revision}>
                      版本 {version.revision} · {version.core.name || '尚未命名'}
                      {version.savedAt
                        ? ` · ${new Date(version.savedAt).toLocaleDateString('zh-CN')}`
                        : ' · 初始设置'}
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
                恢复版本
              </button>
            </div>
          )}
          <div className="field-buttons">
            <button className="text-button" disabled={locked} onClick={() => fileRef.current?.click()}>
              <Upload size={14} />
              导入角色模板
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
                setFeedback({ text: '已导出当前角色，不含私人补充说明或记忆' });
              }}
            >
              <Download size={14} />
              导出当前角色
            </button>
          </div>
          <input
            className="sr-only"
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            aria-label="导入角色模板文件"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              const importingRevision = ++importRevision.current;
              const beforeImport = draft.current.persona;
              try {
                if (file.size > 160_000) throw new Error('角色模板过大。');
                const imported = importPersonaTemplate(await file.text());
                if (importRevision.current !== importingRevision || draft.current.persona !== beforeImport)
                  return;
                replace(imported);
                setFeedback({ text: '模板已载入，保存后生效' });
              } catch (error) {
                if (importRevision.current !== importingRevision) return;
                setFeedback({ text: uiError(error), error: true });
              }
            }}
          />
          {legacyGuidance && (
            <details className="persona-legacy">
              <summary>从原补充说明中选择角色文字</summary>
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
                  setFeedback({ text: '选中文字已放入角色描述，保存后作为角色使用' });
                }}
              >
                将选中文字用作角色描述
              </button>
            </details>
          )}
        </div>
      </details>
    </section>
  );
}
