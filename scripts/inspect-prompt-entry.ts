/**
 * Developer view of what the main model actually receives for one turn, built
 * from the same code paths as the product: standing instructions (in order,
 * with origins), the tool catalogue and the host context pack. It uses an
 * in-memory store and synthetic text only; nothing is sent to any model.
 *
 *   node scripts/inspect-prompt.mjs [presetId] [--full] ["user text"]
 */
import { Store } from '../src/main/store';
import { ToolRegistry } from '../src/main/tools';
import { foregroundSystem, backgroundSystem } from '../src/main/runtime/prompt-composition';
import { personaPreset, type PersonaCore } from '../src/shared/persona';

const args = process.argv.slice(2);
const full = args.includes('--full');
const positional = args.filter(arg => !arg.startsWith('--'));
const preset = (positional[0] || 'mio') as PersonaCore['presetId'];
const text = positional[1] || '帮我看看今晚怎么过去，顺便看会不会下雨';
const size = (value: string) => ({ characters: Array.from(value).length, bytes: Buffer.byteLength(value) });

async function main() {
const store = new Store(':memory:');
try {
  const settings = store.settings();
  const persona = { ...settings.persona, core: personaPreset(preset) };
  const composed = foregroundSystem({ persona, interaction: settings.interaction, rhythm: true });
  const signal = new AbortController().signal;
  const run = store.runtime.begin(text, 'inspect-user', 'inspect-session', signal, { replyToOwner: true });
  const registry = new ToolRegistry({ store, runtimeSession: run, signal, userText: text, currentUserId: 'inspect-user', child: false,
    step: () => {}, plan: () => {}, action: () => {}, changed: () => {}, delegate: async () => ({}) });
  const tools = registry.specs();
  const pack = await store.runtime.compile(run, false, signal);
  const context = store.runtime.context.serialize(pack);
  const toolText = JSON.stringify(tools);
  console.log(`# ${preset} · “${text}”\n`);
  console.log('## Standing instructions (in order)');
  for (const section of composed.sections) console.log(`- ${section.id.padEnd(12)} ${String(size(section.text).characters).padStart(6)} chars  ← ${section.origin}`);
  console.log(`  total ${size(composed.text).characters} chars\n`);
  console.log(`## Tools: ${tools.length} specs, ${size(toolText).characters} chars`);
  for (const tool of [...tools].sort((a, b) => JSON.stringify(b).length - JSON.stringify(a).length).slice(0, 12))
    console.log(`- ${tool.function.name.padEnd(28)} ${String(JSON.stringify(tool).length).padStart(6)} chars`);
  console.log(`\n## Context pack: ${size(context).characters} chars`);
  const data = JSON.parse(context) as Record<string, unknown>;
  for (const [key, value] of Object.entries(data).sort((a, b) => JSON.stringify(b[1]).length - JSON.stringify(a[1]).length).slice(0, 12))
    console.log(`- ${key.padEnd(28)} ${String(JSON.stringify(value).length).padStart(6)} chars`);
  const background = backgroundSystem({ persona, interaction: settings.interaction });
  console.log(`\n## Background standing instructions: ${size(background.text).characters} chars`);
  if (full) {
    console.log('\n---------------- FOREGROUND SYSTEM ----------------\n' + composed.text);
    console.log('\n---------------- CONTEXT PACK ----------------\n' + context);
  }
} finally { store.close(); }
}
void main();
