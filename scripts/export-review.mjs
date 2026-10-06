import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const checked=spawnSync(process.execPath,['scripts/check-review.mjs'],{stdio:'inherit',windowsHide:true});
if(checked.status!==0) throw new Error('Review artifact must pass inspection before export.');
const work=path.resolve('work');fs.mkdirSync(work,{recursive:true});
const output=fs.mkdtempSync(path.join(work,'review-site-'));
fs.cpSync('dist-review',path.join(output,'dist'),{recursive:true});
fs.mkdirSync(path.join(output,'.openai'));
fs.copyFileSync('apps/review-web/hosting.json',path.join(output,'.openai/hosting.json'));
console.log(JSON.stringify({staticCheckout:output,source:'build output from the canonical repository',containsAssistantData:false}));

