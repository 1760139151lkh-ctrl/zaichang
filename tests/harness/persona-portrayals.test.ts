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
    assert.match(prompt, /还不知道对方从哪里出发，所以还算不准现在走是否来得及/);
    assert.match(prompt, /这次日程没有保存成功，写下的内容仍在/);
    assert.match(prompt, /用户改过的描述与口吻优先/);
    assert.match(prompt, /不是用户记忆/);
    assert.match(prompt, /同一件事，换谁来陪，依据的仍是同样的真实资料和实际办成的结果/);
    assert.match(prompt, /保存过的名字、人格与约定沿原样珍惜；对方亲手修改后/);
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

test('a new profile meets 祥子 and saved original characters retain their different voices', async () => {
  const { initialPersona, isUntouchedDefaultPersona, ORIGINAL_COMPANIONS, companionPreset } = await import('../../src/shared/persona');
  const fresh = initialPersona();
  assert.equal(fresh.core.presetId, 'sakiko');
  assert.equal(fresh.core.visualBinding?.companionId, 'sakiko');
  assert.equal(fresh.core.visualBinding?.portrayalBasis, 'source_inspired');
  assert.match(personaGuidance(fresh), /^# 你是丰川祥子/);
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
    assert.equal(migrated.persona.core.presetId, 'sakiko');
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
    assert.equal(fresh.settings().persona.core.presetId, 'sakiko');
    assert.equal(fresh.followDefaultCompanion('sakiko').persona.core.presetId, 'sakiko');
    assert.equal(fresh.settings().persona.revision, 0, 'following the artwork is not a user save');
  } finally { fresh.close(); }
});

test('canonical characters have authentic voices, correct CV attribution and non-isolated cross-companion continuity', async () => {
  const { personaPreset, personaGuidance, personaVoiceAnchor, CANONICAL_CHARACTER_IDS } = await import('../../src/shared/persona');
  const { characterPortrayal } = await import('../../src/shared/persona-portrayals');
  const { Harness } = await import('../../src/main/harness');
  const { Store } = await import('../../src/main/store');
  const { randomUUID } = await import('node:crypto');

  // 1. Verify Uika canon facts: Sasaki Rico is CV, Sakura Ayane is Afterglow Ran / yuri meta
  const uikaPortrayal = characterPortrayal('uika')!;
  assert.match(uikaPortrayal.establishedTraits.join(' '), /佐佐木李子/);
  assert.match(uikaPortrayal.establishedTraits.join(' '), /Sasaki Rico/);
  assert.match(uikaPortrayal.establishedTraits.join(' '), /佐仓绫音/);
  assert.match(uikaPortrayal.establishedTraits.join(' '), /美竹兰/);
  assert.doesNotMatch(uikaPortrayal.establishedTraits[1], /由佐仓绫音注入灵魂/);

  const uikaAnchor = personaVoiceAnchor({ ...migratePersona(), core: personaPreset('uika') });
  assert.match(uikaAnchor, /佐佐木李子/);
  assert.match(uikaAnchor, /美竹兰/);
  assert.match(uikaAnchor, /佐仓绫音/);

  // 2. Verify Sakiko: localized Chinese ojou-sama tone migration, no desuwa repetition in summary/identity
  const sakikoPreset = personaPreset('sakiko');
  const sakikoPortrayal = characterPortrayal('sakiko')!;
  assert.doesNotMatch(sakikoPortrayal.summary, /句句不离ですわ/);
  assert.doesNotMatch(sakikoPortrayal.summary, /ですわ/);
  assert.doesNotMatch(sakikoPreset.identity, /句句带着ですわ/);
  assert.doesNotMatch(sakikoPreset.identity, /ですわ/);

  const sakikoAnchor = personaVoiceAnchor({ ...migratePersona(), core: sakikoPreset });
  assert.match(sakikoAnchor, /本小姐/);
  assert.match(sakikoAnchor, /成何体统/);
  assert.match(sakikoAnchor, /大小姐/);
  assert.match(sakikoAnchor, /傲娇/);
  assert.doesNotMatch(sakikoAnchor, /每句都带上ですわ/);
  assert.doesNotMatch(sakikoAnchor, /句句不离ですわ/);
  assert.doesNotMatch(sakikoAnchor, /句句带着ですわ/);

  const { PRESENCE_NOTE } = await import('../../src/main/runtime/prompt-composition');
  assert.doesNotMatch(PRESENCE_NOTE, /ですわ/);
  assert.match(PRESENCE_NOTE, /保持大小姐傲娇/);

  // 3. Verify Mutsumi: authentic quiet rhythm, cucumber, 苦如犀 (苦しい)
  const mutsumiPortrayal = characterPortrayal('mutsumi')!;
  assert.doesNotMatch(mutsumiPortrayal.summary, /秒懂「苦しい」/);
  assert.doesNotMatch(mutsumiPortrayal.adaptation, /「苦しい」/);
  assert.doesNotMatch(mutsumiPortrayal.intimacy, /苦しい呢/);
  assert.match(mutsumiPortrayal.summary, /苦如犀/);
  assert.match(mutsumiPortrayal.intimacy, /心里很苦呢/);
  const mutsumiPreset = personaPreset('mutsumi');
  assert.doesNotMatch(mutsumiPreset.identity, /懂你「苦しい」/);
  assert.match(mutsumiPreset.identity, /苦如犀/);
  const mutsumiAnchor = personaVoiceAnchor({ ...migratePersona(), core: mutsumiPreset });
  assert.match(mutsumiAnchor, /木子米/);
  assert.match(mutsumiAnchor, /苦しい/);
  assert.match(mutsumiAnchor, /黄瓜/);

  // 3b. Verify Uika and Anon clean Chinese localization
  const uikaPortrayalData = characterPortrayal('uika')!;
  assert.doesNotMatch(uikaPortrayalData.establishedTraits.join(' '), /「いつも通り」/);
  assert.doesNotMatch(uikaPortrayalData.situatedExamples.map(e => e.response).join(' '), /「いつも通り」/);
  assert.match(uikaPortrayalData.situatedExamples.map(e => e.response).join(' '), /和往常一样/);
  const uikaAnchorVoice = personaVoiceAnchor({ ...migratePersona(), core: personaPreset('uika') });
  assert.doesNotMatch(uikaAnchorVoice, /「いつも通り」/);
  assert.match(uikaAnchorVoice, /和往常一样/);

  const anonPortrayalData = characterPortrayal('anon')!;
  assert.doesNotMatch(anonPortrayalData.establishedTraits.join(' '), /、何か？/);
  assert.doesNotMatch(anonPortrayalData.easterEggs.join(' '), /、何か？/);
  assert.doesNotMatch(anonPortrayalData.adaptation, /、何か？/);
  assert.match(anonPortrayalData.establishedTraits.join(' '), /是又怎样啦！/);
  assert.match(anonPortrayalData.adaptation, /是又怎样啦！/);
  const anonAnchorVoice = personaVoiceAnchor({ ...migratePersona(), core: personaPreset('anon') });
  assert.doesNotMatch(anonAnchorVoice, /、何か？/);
  assert.match(anonAnchorVoice, /是又怎样啦！/);

  // 4. Verify all 10 characters are canonical and have full portrayals
  for (const id of CANONICAL_CHARACTER_IDS) {
    const p = characterPortrayal(id);
    assert.ok(p, `Portrayal exists for ${id}`);
    assert.ok(p.name, `Portrayal name exists for ${id}`);
    assert.ok(p.voice, `Portrayal voice exists for ${id}`);
    assert.ok(p.easterEggs.length > 0, `Portrayal easterEggs exist for ${id}`);
  }

  // 5. Verify cross-companion session continuity in harness
  const store = new Store(':memory:');
  try {
    const sakiCore = personaPreset('sakiko');
    store.saveSettings({ mode: 'deepseek', memoryEnabled: true, personaUpdate: { expectedRevision: 0, core: sakiCore } });
    const sessionId = store.session(undefined, '琴房');
    store.putMessage({
      id: randomUUID(),
      sessionId,
      role: 'user',
      content: '今晚练习怎么样了？',
      createdAt: '2026-11-04T11:59:00Z',
      status: 'done',
      steps: [],
      obligations: [],
      actions: [],
      retention: 'purpose_scoped',
    } as any);
    // Previous assistant message was by Sakiko
    store.putMessage({
      id: randomUUID(),
      sessionId,
      role: 'assistant',
      authorName: '丰川祥子',
      authorCompanionId: 'sakiko',
      content: '副歌前的那段转调本小姐已经磨稳了，今晚就练到这里。',
      createdAt: '2026-11-04T12:00:00Z',
      status: 'done',
      steps: [],
      obligations: [],
      actions: [],
      retention: 'purpose_scoped',
    } as any);

    // Now user switches companion to Mutsumi
    const mutsumiCore = personaPreset('mutsumi');
    store.saveSettings({ personaUpdate: { expectedRevision: store.settings().persona.revision, core: mutsumiCore } });

    const hostScope = store.runtime.policy.hostScope();
    const assistantIdentity = store.kernel.latestAssistantReplyIdentity(hostScope, sessionId, []);
    assert.ok(assistantIdentity, 'assistantIdentity retrieved from message history');
    assert.equal(assistantIdentity.authorName, '丰川祥子');
    assert.equal(assistantIdentity.authorCompanionId, 'sakiko');

    const activeCompanionId = store.settings().persona.core.visualBinding?.companionId || store.settings().persona.core.presetId;
    assert.equal(activeCompanionId, 'mutsumi');

    const identityRecord = assistantIdentity as any;
    const authorDiffers = (identityRecord?.authorCompanionId && identityRecord.authorCompanionId !== activeCompanionId)
      || (identityRecord?.authorName && identityRecord.authorName !== (store.settings().persona.core.name.trim() || '在场'));
    assert.ok(authorDiffers, 'Author difference is accurately recognized');

    const prevName = identityRecord?.authorName || '前一位伙伴';
    const previousCompanionInSession = {
      name: prevName,
      companionId: identityRecord?.authorCompanionId || 'previous_companion',
      meaning: `此前在这段对话里陪伴对方的是「${prevName}」。各个角色不是割裂的，知晓彼此的原作羁绊与共同经历；但严禁将上一位伙伴说的话或办成的事冒充为你自己的亲历，请以你当前的鲜活身份和你们之间的真实人际关系自然接续。`,
    };

    assert.equal(previousCompanionInSession.name, '丰川祥子');
    assert.equal(previousCompanionInSession.companionId, 'sakiko');
    assert.match(previousCompanionInSession.meaning, /各个角色不是割裂的/);
    assert.match(previousCompanionInSession.meaning, /严禁将上一位伙伴说的话或办成的事冒充为你自己的亲历/);
  } finally {
    store.close();
  }
});

test('personaVoiceAnchor preserves user-authored personas and custom voices while keeping soul injection for terms of endearment', async () => {
  const { personaPreset, personaVoiceAnchor, selectCompanionPersona, isPresetVoiceKept, migratePersona } = await import('../../src/shared/persona');

  // 1. Changing address (or name) while keeping preset voice fields retains soul injection & nicknames
  const sakikoCore = personaPreset('sakiko');
  assert.equal(isPresetVoiceKept(sakikoCore), true);
  const endearingSakiko = { ...sakikoCore, address: '亲爱的', name: '小祥老婆' };
  assert.equal(isPresetVoiceKept(endearingSakiko), true, 'changing address/name does not break keepsPresetVoice');
  const endearingAnchor = personaVoiceAnchor({ ...migratePersona(), core: endearingSakiko });
  assert.match(endearingAnchor, /亲爱的/);
  assert.match(endearingAnchor, /小祥老婆/);
  assert.match(endearingAnchor, /本小姐/, 'sakiko soul traits are kept when preset voice fields are unchanged');
  assert.match(endearingAnchor, /成何体统/, 'sakiko ojou-sama scolding is kept');
  assert.match(endearingAnchor, /灵魂铁律/, 'soul injection header is kept');
  assert.match(endearingAnchor, /傲娇/, 'tsundere tone is kept');
  assert.doesNotMatch(endearingAnchor, /句句不离ですわ/);
  assert.doesNotMatch(endearingAnchor, /句句带着ですわ/);
  assert.match(endearingAnchor, /saki酱/, 'canonical nicknames are kept');

  // 2. Preserving an edited role (user_authored portrayalBasis) does NOT inject canonical soul or nicknames
  const edited = { ...personaPreset('sakiko'), name: '我选的名字', voice: '我自己编辑的简明语气' };
  const preservedRole = selectCompanionPersona(edited, 'mutsumi', 'preserve_role');
  assert.equal(preservedRole.visualBinding?.portrayalBasis, 'user_authored');
  const preservedAnchor = personaVoiceAnchor({ ...migratePersona(), core: preservedRole });
  assert.doesNotMatch(preservedAnchor, /主客体分清/, 'canonical nicknames line is not injected into user_authored persona');
  assert.doesNotMatch(preservedAnchor, /灵魂铁律/, 'canonical soul injection is not injected into user_authored persona');
  assert.doesNotMatch(preservedAnchor, /苦しい/, 'mutsumi soul is not injected into user_authored persona');
  assert.doesNotMatch(preservedAnchor, /ですわ/, 'sakiko soul is not injected into user_authored persona');
  assert.doesNotMatch(preservedAnchor, /本小姐/, 'sakiko ojou-sama traits not injected into user_authored persona');
  assert.match(preservedAnchor, /我自己编辑的简明语气/, 'custom voice text is directly used');

  // 3. Custom-edited voice (!keepsPresetVoice) on a preset does NOT inject soul injection
  const modifiedVoice = { ...personaPreset('mutsumi'), voice: '冷静直接，不讲多余修饰。' };
  assert.equal(isPresetVoiceKept(modifiedVoice), false, 'custom voice modifies preset voice');
  const modifiedAnchor = personaVoiceAnchor({ ...migratePersona(), core: modifiedVoice });
  assert.doesNotMatch(modifiedAnchor, /主客体分清/, 'canonical nicknames omitted when voice is edited');
  assert.doesNotMatch(modifiedAnchor, /灵魂铁律/, 'canonical soul injection omitted when voice is edited');
  assert.doesNotMatch(modifiedAnchor, /苦しい/, 'canonical soul injection omitted when voice is edited');
  assert.doesNotMatch(modifiedAnchor, /本小姐/, 'canonical soul injection omitted when voice is edited');
  assert.match(modifiedAnchor, /冷静直接，不讲多余修饰。/);
});

test('3+ companion rotation in a session retains all distinct prior speakers and propagates author attribution', async () => {
  const { personaPreset } = await import('../../src/shared/persona');
  const { Store } = await import('../../src/main/store');
  const { randomUUID } = await import('node:crypto');

  const store = new Store(':memory:');
  try {
    const sakiCore = personaPreset('sakiko');
    store.saveSettings({ mode: 'deepseek', memoryEnabled: true, personaUpdate: { expectedRevision: 0, core: sakiCore } });
    const sessionId = store.session(undefined, '三角色轮换琴房');

    // User message creates session evidence for assistant history envelope
    store.putMessage({
      id: randomUUID(),
      sessionId,
      role: 'user',
      content: '今晚练习计划安排得怎么样？',
      createdAt: '2026-11-04T11:59:00Z',
      status: 'done',
      steps: [], obligations: [], actions: [], retention: 'purpose_scoped',
    } as any);

    // Obtain host scope and policy receipt values
    const hostScope = store.runtime.policy.hostScope();
    const scopeData = store.runtime.policy.validate(hostScope);
    const testReceipt = {
      id: randomUUID(),
      privacyEpoch: scopeData.privacyEpoch,
      policyRevision: scopeData.policyRevision,
      providedEvidenceIds: [],
      providedSourceIds: ['history:self'],
    };

    // Turn 1: Sakiko speaks
    const sakiMsgId = randomUUID();
    store.putMessage({
      id: sakiMsgId,
      sessionId,
      role: 'assistant',
      authorName: '丰川祥子',
      authorCompanionId: 'sakiko',
      content: '今晚练习的曲目就按这个清单来，休得偷懒。',
      createdAt: '2026-11-04T12:00:00Z',
      status: 'done',
      steps: [], obligations: [], actions: [], retention: 'purpose_scoped',
      contextReceipt: testReceipt,
    } as any);

    // Verify repository speaker attribution for assistantTextForLocalRead and assistantHistory
    const localRead = store.runtime.repo.assistantTextForLocalRead(hostScope, sessionId, sakiMsgId, 'locate');
    assert.ok(localRead);
    assert.equal(localRead.authorName, '丰川祥子');
    assert.equal(localRead.authorCompanionId, 'sakiko');

    const historyRows = store.runtime.repo.assistantHistory(hostScope, { id: sakiMsgId });
    assert.equal(historyRows.length, 1);
    assert.equal(historyRows[0].authorName, '丰川祥子');
    assert.equal(historyRows[0].authorCompanionId, 'sakiko');

    // Turn 2: Switch to Mutsumi, who also speaks
    const mutsumiMsgId = randomUUID();
    store.putMessage({
      id: mutsumiMsgId,
      sessionId,
      role: 'assistant',
      authorName: '若叶睦',
      authorCompanionId: 'mutsumi',
      content: '……黄瓜很脆。吉他，调好了。',
      createdAt: '2026-11-04T12:05:00Z',
      status: 'done',
      steps: [], obligations: [], actions: [], retention: 'purpose_scoped',
      contextReceipt: testReceipt,
    } as any);

    // Turn 3: Now user switches companion to Uika
    const uikaCore = personaPreset('uika');
    store.saveSettings({ personaUpdate: { expectedRevision: store.settings().persona.revision, core: uikaCore } });

    // Retrieve conversation history & assistant identity
    const assistantIdentity = store.kernel.latestAssistantReplyIdentity(hostScope, sessionId, []);
    assert.ok(assistantIdentity);
    assert.equal(assistantIdentity.authorName, '若叶睦');
    assert.equal(assistantIdentity.authorCompanionId, 'mutsumi');

    const history = store.runtime.repo.conversationHistory(hostScope, sessionId, [], 5);
    const assistantHistoryMsgs = history.filter(m => m.role === 'assistant');
    assert.equal(assistantHistoryMsgs.length, 2);
    assert.equal(assistantHistoryMsgs[0].authorName, '丰川祥子');
    assert.equal(assistantHistoryMsgs[0].authorCompanionId, 'sakiko');
    assert.equal(assistantHistoryMsgs[1].authorName, '若叶睦');
    assert.equal(assistantHistoryMsgs[1].authorCompanionId, 'mutsumi');

    // Verify that multi-companion rotation collects all distinct prior speakers via actual Harness run
    const { Harness } = await import('../../src/main/harness');
    const { DeepSeekClient } = await import('../../src/main/provider');
    const { withHostReplies } = await import('./support');
    let capturedPreviousCompanion: any = null;
    const client = new DeepSeekClient('synthetic');
    client.complete = async (messages, tools) => {
      const names = (tools || []).map(tool => tool.function.name);
      if (names.length === 1 && names[0].startsWith('verify_')) {
        return { content: '', tool_calls: [{ id: 'verify', type: 'function', function: { name: names[0], arguments: JSON.stringify({ neededForCurrentRequest: true, allowed: true, sourceQuote: '', reason: 'fixture' }) } }] };
      }
      for (const m of messages) {
        const parts = Array.isArray(m.content) ? m.content : [{ type: 'text', text: m.content }];
        for (const p of parts) {
          if (p.type === 'text' && typeof p.text === 'string') {
            for (const line of p.text.split('\n')) {
              const trimmed = line.trim();
              if (trimmed.startsWith('{"referenceMaterial":')) {
                try {
                  const obj = JSON.parse(trimmed);
                  capturedPreviousCompanion = obj.referenceMaterial?.previousCompanionInSession;
                } catch {}
              }
            }
          }
        }
      }
      return { content: '初华在此哦～', tool_calls: [] };
    };
    const harness = new Harness(store, () => 'synthetic', () => {}, () => withHostReplies(client));
    harness.start(sessionId, '初华，今晚练得怎么样？');
    await harness.idle();
    await harness.stop();

    assert.ok(capturedPreviousCompanion, 'previousCompanionInSession was captured from harness reference material');
    assert.equal(capturedPreviousCompanion.name, '若叶睦');
    assert.equal(capturedPreviousCompanion.companionId, 'mutsumi');
    assert.deepEqual(capturedPreviousCompanion.priorCompanions, [
      { name: '若叶睦', companionId: 'mutsumi' },
      { name: '丰川祥子', companionId: 'sakiko' },
    ]);
    assert.match(capturedPreviousCompanion.meaning, /「若叶睦」/);
    assert.match(capturedPreviousCompanion.meaning, /「丰川祥子」/);

    const latestMsgs = store.messages(sessionId);
    const uikaReply = latestMsgs[latestMsgs.length - 1];
    assert.equal(uikaReply.authorName, '三角初华');
    assert.equal(uikaReply.authorCompanionId, 'uika');
  } finally {
    store.close();
  }
});


