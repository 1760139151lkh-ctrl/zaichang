import { build } from 'esbuild';
import { stageMaterialRuntime } from './material-runtime.mjs';
await build({
  entryPoints: { main: 'src/main/main.ts', preload: 'src/main/preload.ts' },
  bundle: true,
  outdir: 'dist-electron',
  outExtension: { '.js': '.cjs' },
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  external: ['electron', 'pdfjs-dist', '@napi-rs/canvas', '@napi-rs/canvas-win32-x64-msvc'],
  loader: { '.md': 'text' },
  sourcemap: true,
});
if (process.platform === 'win32' && process.arch === 'x64') await stageMaterialRuntime('dist-electron/material-runtime');
else console.log('Desktop JavaScript built; PDF native runtime and packaging target Windows x64.');
