import fs from 'node:fs';
import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
if(process.platform==='win32'&&process.arch==='x64') {
 fs.mkdirSync('.test-build',{recursive:true});
 await build({entryPoints:['tests/pdf-smoke.ts'],bundle:true,platform:'node',format:'cjs',outfile:'.test-build/pdf-smoke.cjs'});
 const result=spawnSync(process.execPath,['.test-build/pdf-smoke.cjs'],{stdio:'inherit',windowsHide:true});
 if(result.error) throw result.error;
 process.exitCode=result.status??1;
} else console.log('Native PDF smoke targets Windows x64.');

