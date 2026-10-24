import { useEffect, useRef, useState } from 'react';
import { retainedProgramState, restoredProgramState, validateProgramState, type InteractiveProgramDocument, type ProgramLocalState,
  type ProgramLocalStateAddress, type ProgramStateValues } from '../../shared/interactive-program';

const pending = new Set<() => Promise<void>>();
export async function flushProgramLocalStates() { await Promise.allSettled([...pending].map(flush => flush())); }

interface Writer {
  key: string; edited: boolean; active: boolean; revision?: number; ephemeral?: boolean;
  failedRead?: boolean; failedSave?: boolean; conflicted?: boolean; replacing?: boolean;
  staged?: ProgramStateValues; pending?: ProgramStateValues; saved?: string; timer?: ReturnType<typeof setTimeout>; saving?: Promise<void>; reading?: Promise<void>;
  flush: () => Promise<void>;
}

/** This adapter stores only local conditions through the same source owner.
 * A late read/save never replaces a new hand movement or another version. */
export function useProgramLocalState(key: string, program: InteractiveProgramDocument | undefined,
  local: ProgramLocalState | undefined, address: ProgramLocalStateAddress | undefined, admitted: boolean, continuationInputs?: ProgramStateValues) {
  const [seed, setSeed] = useState<{ key: string; inputs: ProgramStateValues; generation: number }>();
  const [issue, setIssue] = useState('');
  const [readAttempt, setReadAttempt] = useState(0);
  const resolution = useRef<{ key: string; choice: 'saved' | 'local' } | undefined>(undefined);
  const unsaved = useRef<{ key: string; inputs: ProgramStateValues } | undefined>(undefined);
  const writer = useRef<Writer | undefined>(undefined), latest = useRef({ program, local, address, admitted, continuationInputs });
  latest.current = { program, local, address, admitted, continuationInputs };
  useEffect(() => {
    const { program: doc, address: source, admitted: allowed, continuationInputs: carried } = latest.current;
    if (!doc || !source || !allowed || typeof window.zaichang.readProgramLocalState !== 'function') return;
    const choice = resolution.current?.key === key ? resolution.current.choice : undefined; resolution.current = undefined;
    const retainedEdit = choice !== 'saved' && unsaved.current?.key === key ? unsaved.current.inputs : undefined;
    const current: Writer = { key, edited: !!retainedEdit, pending: retainedEdit, replacing: choice === 'saved', active: true, flush: async () => {} };
    writer.current = current; setIssue('');
    const flush = async (): Promise<void> => {
      if (current.timer) { clearTimeout(current.timer); current.timer = undefined; }
      if (current.revision === undefined && current.reading) await current.reading;
      if (current.saving) { await current.saving; return flush(); }
      if (current.ephemeral || current.conflicted || current.revision === undefined || !current.pending) return;
      const inputs = current.pending; current.pending = undefined;
      const signature = JSON.stringify(retainedProgramState(doc.states, inputs));
      if (signature === current.saved) {
        if (unsaved.current?.key === key && JSON.stringify(retainedProgramState(doc.states, unsaved.current.inputs)) === signature)
          unsaved.current = undefined;
        return;
      }
      current.saving = (async () => {
        try {
          const result = await window.zaichang.saveProgramLocalState({ ...source, expectedStateRevision: current.revision!, inputs });
          current.revision = result.stateRevision;
          if (result.status === 'conflict') {
            current.conflicted = true; current.failedSave = false;
            current.pending = undefined;
            if (current.active) setIssue('另一处也改过这页。要接回那一份，还是留下眼前的调整？');
          } else if (result.status === 'ephemeral') current.ephemeral = true;
          else {
            current.saved = signature; current.failedSave = false;
            if (unsaved.current?.key === key && JSON.stringify(retainedProgramState(doc.states, unsaved.current.inputs)) === signature) unsaved.current = undefined;
            if (current.active) setIssue('');
          }
        } catch { current.failedSave = true; if (current.active) setIssue('这次的调整还没留住，眼前的内容还在。'); }
        finally { current.saving = undefined; }
      })();
      await current.saving;
      if (current.pending) await flush();
    };
    current.flush = async () => {
      // Frames only stage a record in memory. An explicit flush, the finite
      // process stopping, or this exact writer leaving promotes it once.
      if (current.staged) { current.pending = current.staged; current.staged = undefined; }
      await flush();
    };
    pending.add(current.flush);
    current.reading = window.zaichang.readProgramLocalState(source).then(result => {
      current.revision = result.stateRevision; current.ephemeral = result.status === 'ephemeral';
      if (result.inputs) {
        const inputs = restoredProgramState(doc, retainedProgramState(doc.states, result.inputs));
        current.saved = JSON.stringify(retainedProgramState(doc.states, inputs));
        const original = latest.current.local?.programHash === doc.hash ? restoredProgramState(doc, latest.current.local.inputs)
          : carried ? validateProgramState(doc.states, carried) : restoredProgramState(doc);
        const continuing = !!carried && result.stateRevision === 0 && !current.edited;
        if (continuing) current.pending = original;
        if (choice === 'saved' && !current.edited && unsaved.current?.key === key) unsaved.current = undefined;
        if (current.active && !current.edited && !continuing && (choice === 'saved' || JSON.stringify(inputs) !== JSON.stringify(original)))
          setSeed(previous => ({ key, inputs, generation: (previous?.generation || 0) + 1 }));
      }
      if (current.pending && !current.timer) current.timer = setTimeout(() => { current.timer = undefined; void current.flush(); }, 0);
    }).catch(() => {
      current.failedRead = true;
      if (current.active && choice && !current.edited) resolution.current = { key, choice };
      if (current.active) setIssue('这次没能接回这页保存的调整，眼前的变化还在。');
    });
    return () => {
      current.active = false; void current.flush().finally(() => pending.delete(current.flush));
      if (writer.current === current) writer.current = undefined;
    };
  }, [key, program?.hash, admitted, address?.privacyEpoch, address?.policyRevision, address?.ephemeral, readAttempt]);
  const changed = (inputs: ProgramStateValues, settled = false) => {
    const current = writer.current, doc = latest.current.program;
    if (!current || current.key !== key || !doc || current.ephemeral || settled && current.replacing) return;
    resolution.current = undefined;
    current.edited = true; current.replacing = false; current.staged = undefined;
    unsaved.current = { key, inputs };
    // A return to the saved value may overtake an older queued or in-flight
    // write. It is still the latest intent; only flush can deduplicate it
    // against the receipt of that earlier write.
    current.pending = inputs;
    if (current.conflicted) return;
    if (current.timer) clearTimeout(current.timer);
    current.timer = setTimeout(() => { current.timer = undefined; void current.flush(); }, 120);
  };
  const stage = (inputs: ProgramStateValues) => {
    const current = writer.current;
    if (!current || current.key !== key || current.ephemeral || current.replacing) return;
    current.edited = true; current.staged = inputs;
    unsaved.current = { key, inputs };
  };
  let base: ProgramStateValues | undefined;
  if (program) {
    try { base = local?.programHash === program.hash ? restoredProgramState(program, local.inputs)
      : continuationInputs ? validateProgramState(program.states, continuationInputs) : restoredProgramState(program); } catch { base = restoredProgramState(program); }
  }
  const resolveConflict = (choice: 'saved' | 'local') => {
    const current = writer.current;
    if (current?.key !== key || !current.conflicted) return;
    resolution.current = { key, choice };
    setReadAttempt(attempt => attempt + 1);
  };
  return { inputs: seed?.key === key ? seed.inputs : base, generation: seed?.key === key ? seed.generation : 0, changed, stage, issue,
    resolveConflict: writer.current?.key === key && writer.current.conflicted ? resolveConflict : undefined,
    retryRead: writer.current?.key === key && (writer.current.failedRead || writer.current.failedSave) ? () => setReadAttempt(attempt => attempt + 1) : undefined };
}
