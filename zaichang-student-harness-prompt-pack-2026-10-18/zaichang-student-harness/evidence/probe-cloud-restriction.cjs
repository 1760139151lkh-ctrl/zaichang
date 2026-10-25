/* Portable read-only probe. Supply a local zaichang checkout as argv[2].
 * Does not include private source, call a model, network, database or user API.
 * Reads the exact helper bodies in the selected checkout and strips only
 * TypeScript function annotations. hasCredentials is stubbed false. */
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const crypto = require('node:crypto');
if (!process.argv[2]) {
  process.stderr.write('Usage: node probe-cloud-restriction.cjs /path/to/zaichang\n');
  process.exit(2);
}
const root = path.resolve(process.argv[2]);
const files = ['src/main/runtime/discourse.ts', 'src/main/runtime/turn-controls.ts'];
const sources = files.map(file => fs.readFileSync(path.join(root, file), 'utf8'));
const authoredMatch = sources[0].match(/export function authoredControls\(text: string\) \{[\s\S]*?\n\}/);
const guardMatch = sources[1].match(/export function localCloudRestriction\(text: string\): boolean \{[\s\S]*?\n\}/);
if (!authoredMatch || !guardMatch) {
  process.stderr.write('Helper structure changed: this historical diagnostic needs updating; this is not a product failure verdict.\n');
  process.exit(2);
}
const authored = authoredMatch[0].replace('export ', '').replace('text: string', 'text');
const guard = guardMatch[0].replace('export ', '').replace('text: string', 'text').replace('): boolean', ')');
const inputs = [
  '不要联网查，直接用我给你的课本讲解。',
  '不用上网查资料，就依据这道题推导。',
  '不必解释云端部署，帮我记明天的课程。',
  '这段只在本机分析，不要发给云模型。',
  '我的朋友说不要联网，我的问题是求这个积分。',
  '请根据这道题直接推导。',
];
const context = { hasCredentials: () => false, inputs };
vm.runInNewContext(authored + '\n' + guard + '\nresults = inputs.map(text => ({ text, cloudBlocked: localCloudRestriction(text) }));', context);
process.stdout.write(JSON.stringify({
  diagnostic: 'Source helper behavior only; no full application or model evaluation',
  baselineCommit: 'ba73b049089af718d337076364c6db0f98776d4f',
  selectedCheckoutCommitVerifiedByThisScript: false,
  sourceSha256: Object.fromEntries(files.map((file, index) => [file, crypto.createHash('sha256').update(sources[index]).digest('hex')])),
  results: context.results,
}, null, 2) + '\n');
