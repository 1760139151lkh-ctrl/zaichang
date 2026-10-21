import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import {build} from 'esbuild';
import {isolatedEnvironment} from './test-environment.mjs';
const files=["tests/core.test.ts","tests/map-v2.test.ts","tests/map-v3-core.test.ts","tests/map-fit-layout.test.ts","tests/harness/unit.test.ts","tests/harness/state.test.ts","tests/harness/privacy.test.ts","tests/harness/retention-effects.test.ts","tests/harness/attention-controls.test.ts","tests/harness/campus-scenes.test.ts","tests/harness/search.test.ts","tests/harness/air-quality.test.ts","tests/harness/background-delegation.test.ts","tests/harness/basis-restrictions.test.ts","tests/harness/memory-continuity.test.ts","tests/harness/opportunity-scheduler.test.ts","tests/harness/planning.test.ts","tests/harness/planning-application.test.ts","tests/harness/workflow-skills.test.ts","tests/harness/calendar-export.test.ts","tests/harness/continuity-index.test.ts","tests/harness/memory-retrieval.test.ts","tests/harness/persona-portrayals.test.ts","tests/harness/conversation-evolution.test.ts","tests/harness/companion-presence.test.ts","tests/harness/turn-surface.test.ts","tests/harness/interactive-curve.test.ts"];
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
