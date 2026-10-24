import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
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
if (process.platform === 'win32' && process.arch === 'x64') {
  await stageMaterialRuntime('dist-electron/material-runtime');
  await stageEmbeddingRuntime('dist-electron/embedding-runtime');
}
else console.log('Desktop JavaScript built; PDF native runtime and packaging target Windows x64.');
