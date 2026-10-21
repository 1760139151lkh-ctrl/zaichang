// Prints the composed prompt sections, tool catalogue and context pack sizes
// for a synthetic turn. Usage: node scripts/inspect-prompt.mjs [presetId] [--full] ["text"]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { build } from 'esbuild';
import { isolatedEnvironment } from './test-environment.mjs';

fs.mkdirSync('.test-build', { recursive: true });
fs.mkdirSync('.test-data', { recursive: true });
const outfile = '.test-build/inspect-prompt.cjs';
await build({ entryPoints: ['scripts/inspect-prompt-entry.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'node24',
  outfile, loader: { '.md': 'text' }, external: ['electron'], logLevel: 'error' });
const env = isolatedEnvironment('inspect');
delete env.ZAICHANG_MODEL_TRANSPORT;
env.ZAICHANG_RUNTIME_ROOT = process.cwd();
const result = spawnSync(process.execPath, [outfile, ...process.argv.slice(2)], { stdio: 'inherit', windowsHide: true, env });
process.exitCode = result.status ?? 1;
