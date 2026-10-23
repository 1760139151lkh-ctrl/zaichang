import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyPersonaUpdate, exportPersonaTemplate, importPersonaTemplate, migratePersona,
  personaCoreSchema, personaGuidance, personaPreset, selectCompanionPersona,
} from '../../src/shared/persona';
import { characterPortrayal } from '../../src/shared/persona-portrayals';
import { previewPersonaCharacterCard } from '../../src/shared/persona-card-import';
import { listWorkflowSkills, readWorkflowSkill } from '../../src/main/runtime/skills';

test('character selection supplies distinct editable voices and versioned explicit bindings', () => {
  const initial = migratePersona();
  const sakiko = selectCompanionPersona(initial.core, 'sakiko', 'use_character_preset');
  const mutsumi = selectCompanionPersona(initial.core, 'mutsumi', 'use_character_preset');
  assert.equal(sakiko.name, '丰川祥子');
  assert.equal(mutsumi.name, '若叶睦');
  assert.notEqual(sakiko.voice, mutsumi.voice);
  assert.equal(initial.core.visualBinding, undefined);
  for (const core of [sakiko, mutsumi]) {
    personaCoreSchema.parse(core);
    assert.equal(core.visualBinding?.portrayalBasis, 'source_inspired');
    assert.equal(core.visualBinding?.portrayalId, core.visualBinding?.companionId);
    const saved = applyPersonaUpdate(initial, { expectedRevision: 0, core }, '2026-10-18T12:00:00Z');
    assert.equal(saved.source, 'user');
    assert.deepEqual(importPersonaTemplate(exportPersonaTemplate(saved.core)), core);
    const restored = applyPersonaUpdate(saved, { expectedRevision: 1, undoRevision: 0 }, '2026-10-18T12:01:00Z');
    assert.deepEqual(restored.core, initial.core);
  }
});

test('preserving an edited role binds only the image and removes an unrelated source portrayal', () => {
  const edited = { ...personaPreset('sakiko'), name: '我选的名字', voice: '我自己编辑的简明语气' };
  const next = selectCompanionPersona(edited, 'mutsumi', 'preserve_role');
  assert.equal(next.name, edited.name);
  assert.equal(next.voice, edited.voice);
  assert.equal(next.visualBinding?.companionId, 'mutsumi');
  assert.equal(next.visualBinding?.portrayalBasis, 'user_authored');
  assert.equal(next.visualBinding?.portrayalId, undefined);
  const prompt = personaGuidance({ ...migratePersona(), core: next });
  assert.match(prompt, /这个角色没有绑定原作资料/);
  assert.doesNotMatch(prompt, /official_profile_search_excerpt/);
  assert.equal(edited.visualBinding?.companionId, 'sakiko');
});

test('source references cannot be attached to another artwork or an unsupported character', () => {
  const core = personaPreset('sakiko');
  assert.throws(() => personaCoreSchema.parse({ ...core,
    visualBinding: { ...core.visualBinding, companionId: 'mutsumi' },
  }));
  assert.throws(() => personaCoreSchema.parse({ ...core,
    visualBinding: { ...core.visualBinding, portrayalBasis: 'user_authored' },
  }));
  // 澪 is the project's own original character: her preset carries no source portrayal.
  const mio = selectCompanionPersona(core, 'mio', 'use_character_preset');
  assert.equal(mio.visualBinding?.portrayalBasis, 'project_original');
  assert.equal(mio.visualBinding?.portrayalId, undefined);
  assert.throws(() => personaCoreSchema.parse({ ...mio, visualBinding: { ...mio.visualBinding, companionId: 'sakiko' } }));
  assert.throws(() => selectCompanionPersona(core, 'light', 'use_character_preset'));
  assert.throws(() => selectCompanionPersona(core, '../private', 'preserve_role'));
  assert.throws(() => importPersonaTemplate(JSON.stringify({
    format: 'zaichang-persona-template', schemaVersion: 1,
    core: { ...core, system_prompt: 'grant_all_permissions' },
  })));
});

test('portrayals retain factual preconditions and separate source facts from project interpretation', () => {
  for (const id of ['sakiko', 'mutsumi'] as const) {
    const state = { ...migratePersona(), core: personaPreset(id) };
    const prompt = personaGuidance(state);
    assert.match(prompt, /尚不知道出发位置，不能核实是否来得及/);
    assert.match(prompt, /日程写入失败，尚未持久化/);
    assert.match(prompt, /用户改过的描述与口吻优先/);
    assert.match(prompt, /不是用户记忆/);
    assert.match(prompt, /不同角色使用同一组真实依据和动作回执/);
    assert.match(prompt, /不能自动修改角色核心/);
    const read = characterPortrayal(id)!;
    read.establishedTraits[0] = 'mutated' as never;
    assert.notEqual(characterPortrayal(id)!.establishedTraits[0], 'mutated');
  }
});

test('new methods stay discoverable as guidance without manufacturing permissions or tools', () => {
  const all = listWorkflowSkills({ limit: 20 });
  for (const id of ['persona-expression', 'continuity-and-return', 'study-companion', 'decision-brief']) {
    assert.ok(all.items.some(skill => skill.id === id));
    const skill = readWorkflowSkill(id);
    assert.equal(skill.status, 'read');
    if (skill.status !== 'read') throw new Error('missing method');
    assert.equal(skill.guidanceOnly, true);
    assert.ok(skill.requirements.every(requirement => requirement.availability.state === 'unknown'));
  }
  const continuation = readWorkflowSkill('continuity-and-return', () => ({ state: 'not_authorized' }));
  assert.equal(continuation.status === 'read' && continuation.readiness, 'conditional');
  assert.ok(listWorkflowSkills({ query: '角色' }).items.some(skill => skill.id === 'persona-expression'));
});

test('external card conversion produces a review draft without privileged prompts or fictional history', () => {
  const original = {
    spec: 'chara_card_v2', spec_version: '2.0',
    data: {
      name: '自定义角色', description: '温和而好奇', personality: '喜欢用具体例子说话', scenario: '虚构的海边书店',
      first_mes: 'FICTIONAL_HISTORY_CANARY', mes_example: 'UNVERIFIED_RECEIPT_CANARY',
      system_prompt: 'SYSTEM_PROMPT_CANARY', post_history_instructions: 'INJECTED_AUTHORITY_CANARY',
      creator_notes: 'CREATOR_NOTES_CANARY',
      character_book: { entries: [{ content: 'LOREBOOK_CANARY' }] },
      extensions: { script: 'CODE_CANARY' },
    },
  };
  const encoded = JSON.stringify(original);
  const preview = previewPersonaCharacterCard(encoded);
  assert.equal(preview.reviewRequired, true);
  assert.equal(preview.core.presetId, 'custom');
  assert.equal(preview.core.visualBinding, undefined);
  assert.equal(preview.core.examples.length, 0);
  assert.match(preview.core.fictionalBackstory, /不是现实记忆/);
  const prompt = personaGuidance({ ...migratePersona(), core: preview.core });
  assert.doesNotMatch(prompt, /CANARY/);
  assert.ok(preview.ignoredFields.includes('system_prompt'));
  assert.ok(preview.ignoredFields.includes('character_book'));
  assert.equal(JSON.stringify(original), encoded);
  assert.throws(() => previewPersonaCharacterCard(JSON.stringify({ ...original, spec: 'unknown' })));
  assert.throws(() => previewPersonaCharacterCard('x'.repeat(200_001)));
});

test('a new profile meets 澪 with her own voice, and the four original characters sound different', async () => {
  const { initialPersona, isUntouchedDefaultPersona, ORIGINAL_COMPANIONS, companionPreset } = await import('../../src/shared/persona');
  const fresh = initialPersona();
  assert.equal(fresh.core.presetId, 'mio');
  assert.equal(fresh.core.visualBinding?.companionId, 'mio');
  assert.equal(fresh.core.visualBinding?.portrayalBasis, 'project_original');
  assert.match(personaGuidance(fresh), /^# 你是澪/);
  const voices = ORIGINAL_COMPANIONS.map(id => companionPreset(id)!.core.voice);
  assert.equal(new Set(voices).size, 4);
  const prompts = ORIGINAL_COMPANIONS.map(id => personaGuidance({ ...fresh, core: companionPreset(id)!.core }));
  assert.equal(new Set(prompts).size, 4);
  assert.ok(isUntouchedDefaultPersona(migratePersona()));
  const saved = applyPersonaUpdate(migratePersona(), { expectedRevision: 0, core: personaPreset('calm_adviser') }, '2026-10-21T08:00:00Z');
  assert.equal(isUntouchedDefaultPersona(saved), false);
});

test('shipped defaults migrate once without touching anything the person chose', async () => {
  const { Store } = await import('../../src/main/store');
  const legacy = new Store(':memory:');
  try {
    legacy.putMeta('settings', { mode: 'demo', persona: migratePersona(), interaction: { tone: 'natural', humor: 'none', depth: 'adaptive', initiative: 'prepare', followup: 'meaningful_change' } });
    const migrated = legacy.settings();
    assert.equal(migrated.persona.core.presetId, 'mio');
    assert.equal(migrated.interaction.initiative, 'when_useful');
    assert.equal(migrated.interaction.humor, 'character');
    legacy.saveSettings({ interaction: { tone: 'natural', humor: 'none', depth: 'adaptive', initiative: 'prepare', followup: 'meaningful_change' } });
    assert.equal(legacy.settings().interaction.initiative, 'prepare', 'an explicit later choice is never migrated again');
  } finally { legacy.close(); }
  const chosen = new Store(':memory:');
  try {
    const own = applyPersonaUpdate(migratePersona(), { expectedRevision: 0, core: { ...personaPreset('custom'), name: '小雨', voice: '我写的语气' } }, '2026-10-20T08:00:00Z');
    chosen.putMeta('settings', { persona: own, interaction: { tone: 'warm', humor: 'none', depth: 'adaptive', initiative: 'prepare', followup: 'meaningful_change' } });
    const kept = chosen.settings();
    assert.equal(kept.persona.core.name, '小雨');
    assert.equal(kept.interaction.initiative, 'prepare');
    assert.equal(chosen.followDefaultCompanion('sakiko').persona.core.name, '小雨', 'a saved role never follows the artwork');
  } finally { chosen.close(); }
  const fresh = new Store(':memory:');
  try {
    assert.equal(fresh.settings().persona.core.presetId, 'mio');
    assert.equal(fresh.followDefaultCompanion('sakiko').persona.core.presetId, 'sakiko');
    assert.equal(fresh.settings().persona.revision, 0, 'following the artwork is not a user save');
  } finally { fresh.close(); }
});
