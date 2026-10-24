import { useEffect, useRef, useState } from 'react';
import { retainedProgramState, restoredProgramState, validateProgramState, type InteractiveProgramDocument, type ProgramLocalState,
  type ProgramLocalStateAddress, type ProgramStateValues } from '../../shared/interactive-program';

const pending = new Set<() => Promise<void>>();
export async function flushProgramLocalStates() { await Promise.allSettled([...pending].map(flush => flush())); }

interface Writer {
  key: string; edited: boolean; active: boolean; revision?: number; ephemeral?: boolean;
  failedRead?: boolean; failedSave?: boolean;
  pending?: ProgramStateValues; saved?: string; timer?: ReturnType<typeof setTimeout>; saving?: Promise<void>; reading?: Promise<void>;
  flush: () => Promise<void>;
}

/** This adapter stores only local conditions through the same source owner.
 * A late read/save never replaces a new hand movement or another version. */
export function useProgramLocalState(key: string, program: InteractiveProgramDocument | undefined,
  local: ProgramLocalState | undefined, address: ProgramLocalStateAddress | undefined, admitted: boolean, continuationInputs?: ProgramStateValues) {
  const [seed, setSeed] = useState<{ key: string; inputs: ProgramStateValues; generation: number }>();
  const [issue, setIssue] = useState('');
  const [readAttempt, setReadAttempt] = useState(0);
  const unsaved = useRef<{ key: string; inputs: ProgramStateValues } | undefined>(undefined);
  const writer = useRef<Writer | undefined>(undefined), latest = useRef({ program, local, address, admitted, continuationInputs });
  latest.current = { program, local, address, admitted, continuationInputs };
  useEffect(() => {
    const { program: doc, address: source, admitted: allowed, continuationInputs: carried } = latest.current;
    if (!doc || !source || !allowed || typeof window.zaichang.readProgramLocalState !== 'function') return;
    const retainedEdit = unsaved.current?.key === key ? unsaved.current.inputs : undefined;
    const current: Writer = { key, edited: !!retainedEdit, pending: retainedEdit, active: true, flush: async () => {} };
    writer.current = current; setIssue('');
    const flush = async (): Promise<void> => {
      if (current.timer) { clearTimeout(current.timer); current.timer = undefined; }
      if (current.revision === undefined && current.reading) await current.reading;
      if (current.saving) { await current.saving; return flush(); }
      if (current.ephemeral || current.revision === undefined || !current.pending) return;
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
            current.pending = undefined;
            if (current.active) setIssue('这页在另一处也有调整，眼前的变化还没有覆盖过去。');
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
    current.flush = flush; pending.add(flush);
    current.reading = window.zaichang.readProgramLocalState(source).then(result => {
      current.revision = result.stateRevision; current.ephemeral = result.status === 'ephemeral';
      if (result.inputs) {
        const inputs = restoredProgramState(doc, retainedProgramState(doc.states, result.inputs));
        current.saved = JSON.stringify(retainedProgramState(doc.states, inputs));
        const original = latest.current.local?.programHash === doc.hash ? restoredProgramState(doc, latest.current.local.inputs)
          : carried ? validateProgramState(doc.states, carried) : restoredProgramState(doc);
        const continuing = !!carried && result.stateRevision === 0 && !current.edited;
        if (continuing) current.pending = original;
        if (current.active && !current.edited && !continuing && JSON.stringify(inputs) !== JSON.stringify(original))
          setSeed(previous => ({ key, inputs, generation: (previous?.generation || 0) + 1 }));
      }
      if (current.pending && !current.timer) current.timer = setTimeout(() => { current.timer = undefined; void flush(); }, 0);
    }).catch(() => {
      current.failedRead = true;
      if (current.active) setIssue('这次没能接回这页保存的调整，眼前的变化还在。');
    });
    return () => {
      current.active = false; void flush().finally(() => pending.delete(flush));
      if (writer.current === current) writer.current = undefined;
    };
  }, [key, program?.hash, admitted, address?.privacyEpoch, address?.policyRevision, address?.ephemeral, readAttempt]);
  const changed = (inputs: ProgramStateValues) => {
    const current = writer.current, doc = latest.current.program;
    if (!current || current.key !== key || !doc || current.ephemeral) return;
    current.edited = true;
    unsaved.current = { key, inputs };
    // A return to the saved value may overtake an older queued or in-flight
    // write. It is still the latest intent; only flush can deduplicate it
    // against the receipt of that earlier write.
    current.pending = inputs;
    if (current.timer) clearTimeout(current.timer);
    current.timer = setTimeout(() => { current.timer = undefined; void current.flush(); }, 120);
  };
  let base: ProgramStateValues | undefined;
  if (program) {
    try { base = local?.programHash === program.hash ? restoredProgramState(program, local.inputs)
      : continuationInputs ? validateProgramState(program.states, continuationInputs) : restoredProgramState(program); } catch { base = restoredProgramState(program); }
  }
  return { inputs: seed?.key === key ? seed.inputs : base, generation: seed?.key === key ? seed.generation : 0, changed, issue,
    retryRead: writer.current?.key === key && (writer.current.failedRead || writer.current.failedSave) ? () => setReadAttempt(attempt => attempt + 1) : undefined };
}
