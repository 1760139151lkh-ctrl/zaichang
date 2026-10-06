import { build } from 'esbuild';
await build({entryPoints:['src/main/mapBridge.ts'],bundle:true,platform:'node',format:'esm',outfile:process.argv[2]||'assets/map-v2/shared-bridge.mjs',logLevel:'warning'});
