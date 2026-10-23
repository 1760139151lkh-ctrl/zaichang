import { createHash } from 'node:crypto';
import { z } from 'zod';
import { HarnessError, workSourceRefSchema, type ScopeHandle, type WorkSourceBinding } from '../../shared/harness';
import { methodWorkHelpInputSchema, methodWorkHelpProofSchema, type MethodWorkHelpInput,
  type MethodWorkHelpProof } from '../../shared/method-work-help';
import { personalMethodSourcesSchema, type PersonalMethodSources } from '../../shared/personal-method';
import { companionSessionDataSchema, companionSnapshotProofSchema } from '../../shared/companion-session';
import type { StudyCompanionService, StudyCompanionContext } from './study-companion';
import type { CompanionSessionService } from './companion-session';
import type { MaterialService } from '../materials/service';
import { canonical, codePointSlice } from './semantics';
import { noteSourceProofSchema } from '../../shared/notes-source';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const refs = z.array(workSourceRefSchema).max(32);
type Context = Pick<StudyCompanionContext, 'restrictToSessionId' | 'permits' | 'signal'>;
type CompanionInput = Extract<MethodWorkHelpInput, { owner: 'companion_session' }>
  & { messageId: string; sceneId: string; sceneRevision: number };
export interface PreparedMethodWorkHelp { input: MethodWorkHelpInput; proof: MethodWorkHelpProof;
  text: string; inheritedSources: PersonalMethodSources[] }
export interface MethodWorkHelpOwner {
  prepare(handle: ScopeHandle, input: MethodWorkHelpInput, context: Context): Promise<PreparedMethodWorkHelp>;
  read(handle: ScopeHandle, proof: MethodWorkHelpProof, context?: Context): string | undefined;
  verify(handle: ScopeHandle, proof: MethodWorkHelpProof): boolean;
}

/** Extends the original owners' selected-help read, rather than opening the
 * current whole paper through generic work(). Source qualification precedes
 * the selected old words. No material body/PDF is read by the sync proof gate. */
export function createMethodWorkHelpOwner(study: StudyCompanionService, companion: CompanionSessionService,
  materials: Pick<MaterialService, 'retainedTextIdentityCurrent'>): MethodWorkHelpOwner {
  const repo = study.repo;
  const eligible = (handle: ScopeHandle, id: string, matterId: string, binding?: WorkSourceBinding, context: Context = {}) => {
    const scope = repo.scope(handle);
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self'
      || !scope.sources.includes('work:self') || !scope.grants.includes('evidence:read')
      || repo.hasFence(id) || repo.hasFence(matterId)) return false;
    const f = repo.filter(handle);
    const matter = repo.db.prepare(`SELECT r.id FROM h_work r WHERE ${f.sql} AND r.id=? AND r.kind='episode'
      AND json_extract(r.payload,'$.data.type')='collaboration_frame' AND json_type(r.payload,'$.sourceBinding')='object'`)
      .get(...f.params, matterId);
    const artifact = repo.db.prepare(`SELECT r.id FROM h_work r WHERE ${f.sql} AND r.id=?
      AND json_extract(r.payload,'$.data.type') IN ('study_companion','companion_session')
      AND json_extract(r.payload,'$.data.matterId')=? AND json_type(r.payload,'$.sourceBinding')='object'`)
      .get(...f.params, id, matterId);
    return !!matter && !!artifact
      && (!binding || binding.refs.every(ref => context.permits?.(ref) !== false) && repo.workBindingsReadable(handle, [binding]));
  };
  const inherited = (raw: unknown): PersonalMethodSources[] => raw === null || raw === undefined ? []
    : z.array(personalMethodSourcesSchema).max(16).parse(typeof raw === 'string' ? JSON.parse(raw) : raw);
  const materialIdentity = (handle: ScopeHandle, raw: Record<string, unknown>, interpretation: 'retained_text_layer' | 'retained_file_lifetime_only') => {
    const event = repo.evidence(handle, String(raw.sourceEventId));
    if (!event?.parentEventId || event.kind !== 'file_import' || event.locator?.kind !== 'file'
      || event.locator.artifactId !== raw.resourceId || event.contentVersion !== raw.contentVersion)
      throw new HarnessError('personal_method_help_material', '这次帮助用过的原文件身份现在不可核对。');
    const identity = { resourceId: String(raw.resourceId), sha256: String(raw.sha256), version: Number(raw.version),
      sourceEventId: event.id, contentVersion: event.contentVersion, parentEventId: event.parentEventId, interpretation };
    if (!materials.retainedTextIdentityCurrent(handle, identity))
      throw new HarnessError('personal_method_help_material', '原文件已经退出，没有从旧纸面重新签发材料许可。');
    return identity;
  };
  const studyMetadata = (handle: ScopeHandle, input: { id: string; matterId: string; stepId: string }, context: Context) => {
    if (!eligible(handle, input.id, input.matterId)) return;
    const f = repo.filter(handle);
    const row = repo.db.prepare(`SELECT r.revision,json_extract(r.payload,'$.data.sessionId') AS session_id,
      json_extract(r.payload,'$.data.source') AS initial_source,json_extract(s.value,'$.source') AS step_source,
      json_extract(s.value,'$.supports') AS supports,json_extract(r.payload,'$.personalMethodSources') AS methods,
      json_extract(r.payload,'$.data.noteSources') AS note_sources,json_extract(r.payload,'$.data.problem.proof') AS note_problem,
      json_extract(r.payload,'$.data.priorProblemSources') AS prior_problems,
      json_object('kind',json_extract(r.payload,'$.data.problem.kind'),'ref',json_extract(r.payload,'$.data.problem.ref'),
        'resourceId',json_extract(r.payload,'$.data.problem.resourceId'),'sha256',json_extract(r.payload,'$.data.problem.sha256'),
        'version',json_extract(r.payload,'$.data.problem.version'),'sourceEventId',json_extract(r.payload,'$.data.problem.sourceEventId'),
        'contentVersion',json_extract(r.payload,'$.data.problem.contentVersion'),'sourceRefs',json_extract(r.payload,'$.data.problem.sourceRefs'),
        'page',json_extract(r.payload,'$.data.problem.page'),'start',json_extract(r.payload,'$.data.problem.start'),
        'end',json_extract(r.payload,'$.data.problem.end'),'quoteSha256',json_extract(r.payload,'$.data.problem.quoteSha256'),
        'crop',json_extract(r.payload,'$.data.problem.crop')) AS problem
      FROM h_work r,json_each(r.payload,'$.data.steps') s WHERE ${f.sql} AND r.id=? AND r.kind='experience'
      AND json_extract(r.payload,'$.data.type')='study_companion' AND json_extract(r.payload,'$.data.matterId')=?
      AND json_extract(s.value,'$.id')=? LIMIT 1`).get(...f.params, input.id, input.matterId, input.stepId);
    if (!row || context.restrictToSessionId && row.session_id !== context.restrictToSessionId) return;
    const problem = JSON.parse(String(row.problem)) as Record<string, unknown>;
    if (problem.kind === 'note') problem.proof = noteSourceProofSchema.parse(JSON.parse(String(row.note_problem)));
    const noteSources = z.array(noteSourceProofSchema).max(17).parse(row.note_sources === null ? [] : JSON.parse(String(row.note_sources)));
    if (!repo.noteSourcesReadable(handle, noteSources)) return;
    // SQLite JSON objects retain nested JSON values. Neither a page description
    // nor its question/answer prose is selected into this identity.
    const stepRefs = refs.parse([JSON.parse(String(row.step_source)), ...JSON.parse(String(row.supports))]);
    const problemRefs = problem.kind === 'evidence' ? [problem.ref] : problem.sourceRefs;
    const priorProblems = row.prior_problems === null ? [] : JSON.parse(String(row.prior_problems)) as Record<string, unknown>[];
    const priorRefs = priorProblems.flatMap(source => source.kind === 'evidence' ? [source.ref] : source.kind === 'material'
      && Array.isArray(source.sourceRefs) ? source.sourceRefs : []);
    const sourceRefs = refs.parse([JSON.parse(String(row.initial_source)), ...stepRefs, ...(Array.isArray(problemRefs) ? problemRefs : []), ...priorRefs]);
    return { revision: Number(row.revision), sessionId: String(row.session_id), stepRefs, sourceRefs,
      problem, noteSources, problemIdentitySha256: sha(canonical(problem)), methods: row.methods };
  };
  const studyText = (handle: ScopeHandle, input: { id: string; stepId: string }) => {
    const f = repo.filter(handle);
    const row = repo.db.prepare(`SELECT json_extract(s.value,'$.text') AS text FROM h_work r,json_each(r.payload,'$.data.steps') s
      WHERE ${f.sql} AND r.id=? AND json_extract(r.payload,'$.data.type')='study_companion'
      AND json_extract(s.value,'$.id')=? LIMIT 1`).get(...f.params, input.id, input.stepId);
    return typeof row?.text === 'string' ? row.text : undefined;
  };
  const companionSnapshot = (handle: ScopeHandle, input: CompanionInput | Extract<MethodWorkHelpProof, { owner: 'companion_session' }>, context: Context,
    includeText: boolean) => {
    const scope = repo.scope(handle);
    if (!scope.sources.includes('history:self') || repo.hasFence(input.messageId) || repo.hasFence(input.sceneId)
      || !eligible(handle, input.id, input.matterId)) return;
    const row = repo.db.prepare(`SELECT m.session_id,json_extract(c.value,'$.runId') AS run_id,
      ${includeText ? 'json_extract(c.value,?)' : 'NULL'} AS text,json_extract(module.value,'$.sourceBinding') AS binding,
      json_extract(c.value,'$.snapshotProof') AS snapshot_proof
      FROM messages m,json_each(m.payload,'$.scenes') scene,json_each(scene.value,'$.coWork') c,
        json_each(scene.value,'$.modules') module
      WHERE m.id=? AND m.role='assistant' AND json_extract(m.payload,'$.status')='done'
      AND json_extract(scene.value,'$.kind')='discussion' AND json_extract(scene.value,'$.id')=? AND json_extract(scene.value,'$.revision')=?
      AND json_extract(c.value,'$.id')=? AND json_extract(c.value,'$.revision')=? AND json_extract(c.value,'$.matterId')=?
      AND json_extract(module.value,'$.owner')='co_work' AND json_extract(module.value,'$.id')=? AND json_extract(module.value,'$.revision')=?
      AND EXISTS(SELECT 1 FROM h_evidence e WHERE json_extract(e.payload,'$.sessionId')=m.session_id
        AND e.owner=? AND e.workspace=? AND e.subject=? AND e.world='real' AND e.status!='deleted')
      AND NOT EXISTS(SELECT 1 FROM h_evidence e WHERE json_extract(e.payload,'$.sessionId')=m.session_id AND (e.owner!=? OR e.workspace!=?))
      ${context.restrictToSessionId ? 'AND m.session_id=?' : ''} LIMIT 1`).get(...(includeText ? ['$.'.concat(input.field)] : []), input.messageId, input.sceneId,
        input.sceneRevision, input.id, input.revision, input.matterId, input.id, input.revision,
        scope.principalId, scope.workspaceId, scope.principalId, scope.principalId, scope.workspaceId,
        ...(context.restrictToSessionId ? [context.restrictToSessionId] : []));
    return row ? { text: typeof row.text === 'string' ? row.text : undefined, sessionId: String(row.session_id), runId: String(row.run_id),
      binding: JSON.parse(String(row.binding)) as WorkSourceBinding,
      proof: row.snapshot_proof === null ? undefined : companionSnapshotProofSchema.parse(JSON.parse(String(row.snapshot_proof))) } : undefined;
  };
  const learningCurrent = (handle: ScopeHandle, source: Extract<MethodWorkHelpProof, { owner: 'companion_session' }>['learningProcessRefs'][number],
    matterId: string, context: Context) => {
    if (repo.hasFence(source.id) || !repo.workBindingsReadable(handle, [source.sourceBinding])
      || source.sourceBinding.refs.some(ref => context.permits?.(ref) === false)) return false;
    const f = repo.filter(handle);
    return !!repo.db.prepare(`SELECT r.id FROM h_work r WHERE ${f.sql} AND r.id=?
      AND json_extract(r.payload,'$.data.type')='learning_process' AND json_extract(r.payload,'$.data.matterId')=?`)
      .get(...f.params, source.id, matterId);
  };
  const read = (handle: ScopeHandle, raw: MethodWorkHelpProof, context: Context = {}): string | undefined => {
    const parsed = methodWorkHelpProofSchema.safeParse(raw);
    if (!parsed.success) return;
    const proof = parsed.data;
    if (context.restrictToSessionId && proof.sessionId !== context.restrictToSessionId
      || !eligible(handle, proof.id, proof.matterId, proof.sourceBinding, context)) return;
    let text: string | undefined;
    if (proof.owner === 'study_companion') {
      const current = studyMetadata(handle, proof, context);
      if (!current || current.sessionId !== proof.sessionId || current.problemIdentitySha256 !== proof.problemIdentitySha256
        || canonical(current.noteSources) !== canonical(proof.noteSources || []) || !repo.noteSourcesReadable(handle, proof.noteSources || [])
        || canonical(current.stepRefs) !== canonical(proof.stepRefs)
        || canonical(repo.resolveWorkSourceBinding(handle, current.sourceRefs)) !== canonical(proof.sourceBinding)
        || proof.material && !materials.retainedTextIdentityCurrent(handle, proof.material)) return;
      text = studyText(handle, proof);
    } else {
      if (proof.materials.some(material => !materials.retainedTextIdentityCurrent(handle, material))
        || proof.learningProcessRefs.some(source => !learningCurrent(handle, source, proof.matterId, context))
        || proof.assistantMaterials.some(source => {
          const current = repo.personalMethodAssistantSource(handle, source);
          return !current || canonical(current.sourceRefs) !== canonical(source.sourceRefs);
        })) return;
      const metadata = companionSnapshot(handle, proof, context, false), frozen = metadata?.proof;
      if (frozen && (canonical(frozen.sourceBinding) !== canonical(proof.sourceBinding)
        || canonical(frozen.assistantMaterials) !== canonical(proof.assistantMaterials)
        || canonical(frozen.learningProcessRefs) !== canonical(proof.learningProcessRefs)
        || frozen.materials.length !== proof.materials.length || frozen.materials.some((material, index) => {
          const kept = proof.materials[index];
          return material.resourceId !== kept.resourceId || material.sha256 !== kept.sha256 || material.version !== kept.version
            || material.source.eventId !== kept.sourceEventId || material.source.contentVersion !== kept.contentVersion;
        }) || frozen.personalMethodSources.some(source => repo.verifyPersonalMethodSources?.(handle, source) !== true))) return;
      const snapshot = companionSnapshot(handle, proof, context, true);
      if (!snapshot || snapshot.sessionId !== proof.sessionId || snapshot.runId !== proof.runId
        || canonical(snapshot.binding) !== canonical(proof.sourceBinding)) return;
      text = snapshot.text;
    }
    if (text === undefined || sha(text) !== proof.contentSha256 || proof.end > Array.from(text).length) return;
    const fragment = codePointSlice(text, proof.start, proof.end);
    return sha(fragment) === proof.fragmentSha256 ? fragment : undefined;
  };
  return { read, verify(handle, proof) {
    try { return read(handle, proof) !== undefined; }
    catch (error) { if (error instanceof HarnessError || error instanceof z.ZodError || error instanceof SyntaxError) return false; throw error; }
  },
    async prepare(handle, raw, context) {
      const requested = methodWorkHelpInputSchema.parse(raw); context.signal?.throwIfAborted();
      let input: Extract<MethodWorkHelpInput, { owner: 'study_companion' }> | CompanionInput;
      if (requested.owner === 'companion_session') {
        let address = requested.messageId && requested.sceneId && requested.sceneRevision
          ? { messageId: requested.messageId, sceneId: requested.sceneId, sceneRevision: requested.sceneRevision } : undefined;
        if (!address) {
          const scope = repo.scope(handle);
          if (!scope.sources.includes('history:self') || !eligible(handle, requested.id, requested.matterId))
            throw new HarnessError('personal_method_help_scope', '原帮助不在本次可回读范围。');
          const rows = repo.db.prepare(`SELECT m.id AS message_id,json_extract(scene.value,'$.id') AS scene_id,
            json_extract(scene.value,'$.revision') AS scene_revision FROM messages m,json_each(m.payload,'$.scenes') scene,
            json_each(scene.value,'$.coWork') c WHERE m.role='assistant' AND json_extract(m.payload,'$.status')='done'
            AND json_extract(scene.value,'$.kind')='discussion' AND json_extract(c.value,'$.id')=?
            AND json_extract(c.value,'$.revision')=? AND json_extract(c.value,'$.matterId')=?
            AND EXISTS(SELECT 1 FROM h_evidence e WHERE json_extract(e.payload,'$.sessionId')=m.session_id
              AND e.owner=? AND e.workspace=? AND e.subject=? AND e.world='real' AND e.status!='deleted')
            AND NOT EXISTS(SELECT 1 FROM h_evidence e WHERE json_extract(e.payload,'$.sessionId')=m.session_id AND (e.owner!=? OR e.workspace!=?))
            ${context.restrictToSessionId ? 'AND m.session_id=?' : ''} ORDER BY m.created_at DESC,m.rowid DESC LIMIT 20`)
            .all(requested.id, requested.revision, requested.matterId, scope.principalId, scope.workspaceId, scope.principalId,
              scope.principalId, scope.workspaceId, ...(context.restrictToSessionId ? [context.restrictToSessionId] : []));
          const row = rows.find(value => !repo.hasFence(String(value.message_id)) && !repo.hasFence(String(value.scene_id)));
          if (row) address = { messageId: String(row.message_id), sceneId: String(row.scene_id), sceneRevision: Number(row.scene_revision) };
        }
        if (!address) throw new HarnessError('personal_method_help_snapshot', '这版帮助还没有已发布原页，不从模型起草内容补成既往帮助。');
        input = { ...requested, ...address };
      } else input = requested;
      let text: string, proof: MethodWorkHelpProof, inheritedSources: PersonalMethodSources[];
      if (input.owner === 'study_companion') {
        const current = await study.get(handle, input.id, context); context.signal?.throwIfAborted();
        const metadata = studyMetadata(handle, input, context);
        if (!current || current.record.revision !== input.revision || !metadata || metadata.revision !== input.revision)
          throw new HarnessError('personal_method_help_changed', '陪学内容已变化，请按实际那一行帮助起草。');
        const binding = repo.resolveWorkSourceBinding(handle, metadata.sourceRefs);
        if (!eligible(handle, input.id, input.matterId, binding, context)) throw new HarnessError('personal_method_help_scope', '原帮助不在这次可读范围。');
        text = studyText(handle, input) || '';
        proof = { owner: input.owner, id: input.id, revision: input.revision, matterId: input.matterId, sessionId: metadata.sessionId,
          stepId: input.stepId, stepRefs: metadata.stepRefs, problemIdentitySha256: metadata.problemIdentitySha256,
          start: input.start, end: input.end, contentSha256: sha(text), fragmentSha256: sha(input.quote), sourceBinding: binding,
          ...(metadata.noteSources.length ? { noteSources: metadata.noteSources } : {}),
          ...(['material_text', 'material_page'].includes(String(metadata.problem.kind)) ? { material: materialIdentity(handle, metadata.problem,
            metadata.problem.kind === 'material_text' ? 'retained_text_layer' : 'retained_file_lifetime_only') } : {}) };
        inheritedSources = inherited(current.record.personalMethodSources);
      } else {
        const metadata = companionSnapshot(handle, input, context, false);
        if (!metadata) throw new HarnessError('personal_method_help_snapshot', '这句工作解释没有对应的原消息页面。');
        let frozen = metadata.proof, expectedCurrentText: string | undefined;
        if (!frozen) {
          // Legacy pages did not freeze material proof. Only the exact current
          // original owner may supply it; an older binding alone cannot.
          const current = companion.scene(handle, input.matterId, context.permits);
          if (!current || current.record.id !== input.id || current.record.revision !== input.revision || !current.sourceBinding)
            throw new HarnessError('personal_method_help_changed', '这张旧共做页缺少当时材料证明，未借旧binding开放后来内容。');
          const data = companionSessionDataSchema.parse(current.record.data);
          expectedCurrentText = current.projection[input.field] || undefined;
          frozen = { version: 1, sourceBinding: current.sourceBinding,
            assistantMaterials: data.checkpoint.materials.filter(value => value.kind === 'assistant_message').map(({ kind: _kind, label: _label, ...value }) => value),
            materials: data.checkpoint.materials.filter(value => value.kind === 'file').map(({ label: _label, ...value }) => value),
            learningProcessRefs: data.checkpoint.learningProcessRefs, personalMethodSources: inherited(current.record.personalMethodSources) };
        }
        if (canonical(metadata.binding) !== canonical(frozen.sourceBinding)
          || !eligible(handle, input.id, input.matterId, frozen.sourceBinding, context)
          || frozen.learningProcessRefs.some(source => !learningCurrent(handle, source, input.matterId, context))
          || frozen.personalMethodSources.some(source => repo.verifyPersonalMethodSources?.(handle, source) !== true)
          || frozen.assistantMaterials.some(source => {
            const current = repo.personalMethodAssistantSource(handle, source);
            return !current || canonical(current.sourceRefs) !== canonical(source.sourceRefs);
          })) throw new HarnessError('personal_method_help_changed', '这份实际帮助的一处原依赖现在不可核对。');
        const fileProofs = frozen.materials.map(value => materialIdentity(handle,
          { ...value, sourceEventId: value.source.eventId, contentVersion: value.source.contentVersion }, 'retained_file_lifetime_only'));
        const snapshot = companionSnapshot(handle, input, context, true);
        if (!snapshot?.text || expectedCurrentText !== undefined && snapshot.text !== expectedCurrentText)
          throw new HarnessError('personal_method_help_snapshot', '原消息上的这句帮助现在不可回读。');
        text = snapshot.text;
        proof = { owner: input.owner, id: input.id, revision: input.revision, matterId: input.matterId, sessionId: snapshot.sessionId,
          messageId: input.messageId, sceneId: input.sceneId, sceneRevision: input.sceneRevision, field: input.field, runId: snapshot.runId,
          start: input.start, end: input.end, contentSha256: sha(text), fragmentSha256: sha(input.quote), sourceBinding: frozen.sourceBinding,
          assistantMaterials: frozen.assistantMaterials, materials: fileProofs, learningProcessRefs: frozen.learningProcessRefs };
        inheritedSources = frozen.personalMethodSources;
      }
      if (input.end > Array.from(text).length || codePointSlice(text, input.start, input.end) !== input.quote || read(handle, proof, context) !== input.quote)
        throw new HarnessError('personal_method_help_quote', '所选位置不等于实际提供过的帮助，没有复制替代题答或旧缓存。');
      return { input: requested, proof: methodWorkHelpProofSchema.parse(proof), text: input.quote, inheritedSources };
    } };
}
