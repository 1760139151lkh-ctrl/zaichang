import assert from 'node:assert/strict';
import test from 'node:test';
import { listWorkflowSkills, readWorkflowSkill } from '../../src/main/runtime/skills';
import {
  applyPersonaUpdate, bindPersonaCompanion, COMPANION_PERSONA_LINKS, exportPersonaTemplate,
  importPersonaTemplate, migratePersona, personaGuidance, personaPreset,
} from '../../src/shared/persona';

test('workflow discovery is fully pageable and a filtered miss is not capability absence', () => {
  const ids: string[] = [];
  let offset: number | null = 0;
  while (offset !== null) {
    const page = listWorkflowSkills({ offset, limit: 2 });
    assert.equal(page.guidanceOnly, true);
    assert.ok(page.items.every(item => !('instructions' in item)));
    ids.push(...page.items.map(item => item.id));
    offset = page.nextOffset;
  }
  assert.equal(ids.length, new Set(ids).size);
  assert.ok(ids.includes('memory-investigation') && ids.includes('campus-sports'));
  const miss = listWorkflowSkills({ query: 'unregistered_connector_name' });
  assert.equal(miss.total, 0);
  assert.equal(miss.coverage.matchingOnly, true);
  assert.match(miss.coverage.meaning, /未命中不证明能力不存在/);
  assert.throws(() => listWorkflowSkills({ offset: -1 }));
  assert.throws(() => listWorkflowSkills({ limit: 100 }));
});

test('skill loading distinguishes missing campus connection from loaded procedural knowledge', () => {
  const seen: string[] = [];
  const result = readWorkflowSkill('campus-sports', requirement => {
    seen.push(requirement.name);
    return requirement.name === 'campus.query'
      ? { state: 'not_connected', sourceId: 'campus:zju-account', reason: '尚未认证' }
      : { state: 'available', version: 'test' };
  });
  assert.equal(result.status, 'read');
  if (result.status !== 'read') throw new Error('expected skill');
  assert.equal(result.readiness, 'conditional');
  assert.equal(result.guidanceOnly, true);
  assert.equal(result.requirements.find(item => item.name === 'campus.query')?.availability.state, 'not_connected');
  assert.match(result.requirements[0].coverageNote || '', /有效跑步次数/);
  assert.ok(seen.includes('campus.query'));
  assert.equal(readWorkflowSkill('missing-skill').status, 'not_found');
});

test('resolution does not mutate built-in contracts and unknown availability never becomes ready', () => {
  const unknown = readWorkflowSkill('memory-investigation');
  assert.equal(unknown.status, 'read');
  if (unknown.status !== 'read') throw new Error('expected skill');
  assert.equal(unknown.readiness, 'conditional');
  assert.ok(unknown.requirements.every(item => item.availability.state === 'unknown'));
  const changed = readWorkflowSkill('memory-investigation', requirement => {
    requirement.name = 'forged';
    return { state: 'available' };
  });
  if (changed.status !== 'read') throw new Error('expected skill');
  changed.requirements[0].name = 'changed-result';
  const again = readWorkflowSkill('memory-investigation');
  if (again.status !== 'read') throw new Error('expected skill');
  assert.equal(again.requirements[0].name, 'search_context');
  assert.equal(again.contentHash, unknown.contentHash);
  assert.equal(again.instructions, unknown.instructions);
});

test('optional unavailable abilities do not claim to block all relevant help', () => {
  const result = readWorkflowSkill('contextual-outing', requirement => ({
    state: requirement.optional ? 'not_registered' : 'available',
  }));
  if (result.status !== 'read') throw new Error('expected skill');
  assert.equal(result.readiness, 'ready_for_known_requirements');
  assert.equal(result.requirements.find(item => item.name === 'air_quality.lookup')?.availability.state, 'not_registered');
  assert.match(result.limitation, /具体查询覆盖/);
});

test('explicit visual binding preserves voice and remains a versioned user-authored role choice', () => {
  const initial = migratePersona();
  const core = personaPreset('calm_adviser');
  const linked = bindPersonaCompanion(core, {
    companionId: 'sakiko', characterName: '祥子', portrayalBasis: 'user_authored',
    notes: '我希望说话克制，但会认真记得答应过的小事。',
  });
  assert.equal(core.visualBinding, undefined);
  assert.equal(linked.voice, core.voice);
  assert.equal(COMPANION_PERSONA_LINKS.find(item => item.companionId === 'sakiko')?.characterName, '祥子');
  const saved = applyPersonaUpdate(initial, { expectedRevision: initial.revision, core: linked }, '2026-10-18T12:00:00Z');
  assert.equal(saved.revision, 1);
  assert.equal(saved.source, 'user');
  assert.equal(importPersonaTemplate(exportPersonaTemplate(saved.core)).visualBinding?.companionId, 'sakiko');
  assert.equal(bindPersonaCompanion(saved.core, null).visualBinding, undefined);
  assert.throws(() => bindPersonaCompanion(core, { companionId: '../../private', characterName: 'x', portrayalBasis: 'user_authored', notes: '' }));
  assert.throws(() => applyPersonaUpdate(saved, { expectedRevision: 0, core }, '2026-10-18T12:01:00Z'));
});

test('persona examples carry their factual preconditions and private legacy data never becomes role content', () => {
  const migrated = migratePersona('语气温和；我的私人身份 PRIVATE_TEST_CANARY。');
  assert.doesNotMatch(personaGuidance(migrated), /PRIVATE_TEST_CANARY/);
  assert.doesNotMatch(exportPersonaTemplate(migrated.core), /PRIVATE_TEST_CANARY/);
  const prompts = ['warm_senior', 'lively_partner', 'calm_adviser'].map(id => personaGuidance({
    ...migrated, core: personaPreset(id as 'warm_senior' | 'lively_partner' | 'calm_adviser'),
  }));
  assert.equal(new Set(prompts).size, 3);
  for (const prompt of prompts) {
    assert.match(prompt, /日程写入失败，尚未持久化/);
    assert.match(prompt, /例子里的结果也属于当时/);
    assert.match(prompt, /不同角色使用同一组真实依据和动作回执/);
    assert.match(prompt, /不能自动修改角色核心/);
  }
});
