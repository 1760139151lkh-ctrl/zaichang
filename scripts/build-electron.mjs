import { build } from 'esbuild';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { stageMaterialRuntime } from './material-runtime.mjs';
import { stageEmbeddingRuntime } from './embedding-runtime.mjs';
await build({
  entryPoints: { main: 'src/main/main.ts', preload: 'src/main/preload.ts', 'embedding-worker': 'src/main/memory/embedding-worker.ts' },
  bundle: true,
  outdir: 'dist-electron',
  outExtension: { '.js': '.cjs' },
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  external: ['electron', 'pdfjs-dist', '@napi-rs/canvas', '@napi-rs/canvas-win32-x64-msvc', 'onnxruntime-node', 'onnxruntime-common', '@huggingface/tokenizers'],
  loader: { '.md': 'text' },
  sourcemap: true,
});
await mkdir('dist-electron/tiyi-runtime', { recursive: true });
await copyFile('src/main/integrations/tiyi_connector.py', 'dist-electron/tiyi-runtime/connector.py');
await mkdir('dist-electron/tiyi-runtime/tiyi_modules', { recursive: true });
for (const name of ['__init__', 'common', 'study', 'fitness', 'community'])
  await copyFile(`src/main/integrations/tiyi_modules/${name}.py`, `dist-electron/tiyi-runtime/tiyi_modules/${name}.py`);
execFileSync(process.env.ZAICHANG_PYTHON || 'python', ['-B', 'scripts/stage-tiyi-signing.py'], { stdio: 'inherit', windowsHide: true });
const zjuSource = 'src/main/integrations/zju';
const zjuManifest = JSON.parse(await readFile(path.join(zjuSource, 'upstream.json'), 'utf8'));
for (const relative of [...zjuManifest.files.map(file => file.path), 'upstream.json', 'CONNECTOR.md']) {
  if (typeof relative !== 'string' || !/^(?:scripts\/[a-z_]+\.py|references\/(?:[a-z-]+\.(?:json|md)|calendars\/[\d-]+\.json)|LICENSE|upstream\.json|CONNECTOR\.md)$/.test(relative))
    throw new Error('Unexpected campus runtime file.');
  const destination = path.join('dist-electron/zju-runtime', relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(path.join(zjuSource, relative), destination);
}
if (process.platform === 'win32' && process.arch === 'x64') {
  await stageMaterialRuntime('dist-electron/material-runtime');
  await stageEmbeddingRuntime('dist-electron/embedding-runtime');
}
else console.log('Desktop JavaScript built; PDF native runtime and packaging target Windows x64.');
