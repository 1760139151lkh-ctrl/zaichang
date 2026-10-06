import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import {build} from 'esbuild';
import {isolatedEnvironment} from './test-environment.mjs';
const files=['tests/core.test.ts','tests/map-v2.test.ts','tests/map-v3-core.test.ts','tests/harness/unit.test.ts','tests/harness/state.test.ts','tests/harness/privacy.test.ts','tests/harness/retention-effects.test.ts'];
fs.mkdirSync('.test-data',{recursive:true});
fs.mkdirSync('.test-build',{recursive:true});
const entries=[];
for(const file of files) {
  const output='.test-build/'+file.replaceAll('/','-').replace('.ts','.cjs');
  await build({entryPoints:[file],bundle:true,platform:'node',format:'cjs',target:'node24',outfile:output,loader:{'.md':'text'},external:['electron']});
  entries.push(output);
}
const env=isolatedEnvironment('smoke');
delete env.ZAICHANG_MODEL_TRANSPORT;
env.ZAICHANG_RUNTIME_ROOT=process.cwd();
const result=spawnSync(process.execPath,['--test','--test-reporter=spec','--test-timeout=180000',...entries],{stdio:'inherit',windowsHide:true,env});
if(result.error) throw result.error;
process.exitCode=result.status??1;
