import test from 'node:test';
import assert from 'node:assert/strict';
import { needsControlParse } from '../../src/main/runtime/turn-controls';
import { compactSchema, modelToolSurface, USE_TOOL } from '../../src/main/runtime/tool-surface';
import { Store } from '../../src/main/store';
import { ToolRegistry } from '../../src/main/tools';
import type { ToolSpec } from '../../src/main/provider';

test('ordinary messages skip the separate control call; any hint of a limit keeps it', () => {
  for (const plain of ['今天好累啊', '帮我看看明天的课', '晚上会下雨吗', '这道题我还是没懂，能再讲一遍吗', '哈哈哈哈', '紫金港图书馆怎么走'])
    assert.equal(needsControlParse(plain), false, plain);
  for (const limited of [
    '这句话别记下来', '不要存这段', '忘掉刚才那个', '只看这份笔记就好', '别翻我以前的聊天', '先别改日程，只讨论',
    '帮我给老师写封邮件', '我朋友说他想退学', '如果我明天不去会怎样', '写个故事，主角是我', '不要联网查', '发个消息告诉室友',
    'please do not save this', '这是隐私',
  ]) assert.equal(needsControlParse(limited), true, limited);
  assert.equal(needsControlParse('看看这个', { attachment: true }), true);
  assert.equal(needsControlParse('这里', { reference: true }), true);
  assert.equal(needsControlParse('今'.repeat(200)), true, 'long messages keep the full parse');
});

test('model-facing schemas drop validation noise but keep field names, enums and required lists', () => {
  const schema = { $schema: 'x', type: 'object', additionalProperties: false, required: ['maxLength', 'kind'], properties: {
    kind: { type: 'string', enum: ['text'] },
    maxLength: { type: 'integer', minimum: 1, maximum: 9007199254740991 },
    id: { type: 'string', minLength: 1, maxLength: 160, pattern: '^a' },
  } };
  const compact = compactSchema(schema) as any;
  assert.equal(compact.$schema, undefined);
  assert.equal(compact.additionalProperties, undefined);
  assert.deepEqual(Object.keys(compact.properties), ['kind', 'maxLength', 'id'], 'a field called maxLength survives');
  assert.deepEqual(compact.required, ['maxLength', 'kind']);
  assert.deepEqual(compact.properties.kind.enum, ['text']);
  assert.equal(compact.properties.maxLength.maximum, undefined);
  assert.equal(compact.properties.id.maxLength, undefined);
  assert.equal(compact.properties.id.pattern, undefined);
});

test('specialized tools sit behind use_tool and come forward when the turn is already in that activity', () => {
  const spec = (name: string): ToolSpec => ({ type: 'function', function: { name, description: name, parameters: { type: 'object', properties: {} } } });
  const all = ['look_up', 'present_view', 'study_companion', 'read_study_companion', 'write_reflective_letter'].map(spec);
  const plain = modelToolSurface(all).map(tool => tool.function.name);
  assert.deepEqual(plain, ['look_up', 'present_view', USE_TOOL]);
  const gateway = modelToolSurface(all).find(tool => tool.function.name === USE_TOOL)!;
  assert.match(gateway.function.description, /study_companion/);
  const studying = modelToolSurface(all, new Set(['study'])).map(tool => tool.function.name);
  assert.ok(studying.includes('study_companion') && studying.includes(USE_TOOL));
  assert.deepEqual(modelToolSurface(all.slice(0, 2)).map(tool => tool.function.name), ['look_up', 'present_view'], 'no gateway when nothing is deferred');
});

test('use_tool describes a deferred tool and then runs it through the ordinary execute path', async () => {
  const store = new Store(':memory:');
  try {
    const signal = new AbortController().signal;
    const run = store.runtime.begin('想接着上次那道题', 'surface-user', 'surface-session', signal, { replyToOwner: true });
    const registry = new ToolRegistry({ store, runtimeSession: run, signal, userText: '想接着上次那道题', currentUserId: 'surface-user', child: false,
      step: () => {}, plan: () => {}, action: () => {}, changed: () => {}, delegate: async () => ({}) });
    const names = registry.specs().map(tool => tool.function.name);
    assert.ok(names.includes(USE_TOOL));
    assert.ok(!names.includes('read_learning'), 'deferred tools are not in the native list');
    assert.ok(registry.allSpecs().some(tool => tool.function.name === 'read_learning'), 'but they remain in the host contract');
    const described = JSON.parse(await registry.execute(USE_TOOL, JSON.stringify({ name: 'read_learning' }), 'describe-1'));
    assert.equal(described.status, 'schema');
    assert.equal(described.name, 'read_learning');
    assert.equal(described.parameters.type, 'object');
    const native = JSON.parse(await registry.execute(USE_TOOL, JSON.stringify({ name: 'look_up', arguments: {} })));
    assert.equal(native.code, 'tool_unavailable', 'everyday tools are called directly');
    const viaGateway = await registry.execute(USE_TOOL, JSON.stringify({ name: 'read_learning', arguments: { bogus: true } }), 'call-1');
    const direct = await registry.execute('read_learning', JSON.stringify({ bogus: true }), 'call-2');
    assert.equal(JSON.parse(viaGateway).status, JSON.parse(direct).status, 'same validation as a direct call');
    assert.ok(run.observations?.some(observation => observation.tool === 'read_learning' && observation.toolCallId === 'call-1'),
      'the observation keeps the real tool name and call id');
  } finally { store.close(); }
});
