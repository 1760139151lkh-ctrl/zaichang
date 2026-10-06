import assert from 'node:assert/strict';
import {_electron} from 'playwright';
import {isolatedEnvironment} from './test-environment.mjs';
const env=isolatedEnvironment('desktop-smoke');
delete env.ZAICHANG_MODEL_TRANSPORT;
env.ZAICHANG_RUNTIME_ROOT=process.cwd();
const app=await _electron.launch({args:['.'],cwd:process.cwd(),env,timeout:30000});
try {
  const page=await app.firstWindow(), errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.getByRole('button',{name:'更多功能',exact:true}).waitFor();
  await page.getByRole('button',{name:'更多功能',exact:true}).click();
  await page.getByRole('menuitem',{name:'打开校园地图',exact:true}).click();
  await page.locator('[data-ready="true"]').waitFor({state:'attached',timeout:30000});
  const version=await page.locator('[data-ready="true"]').getAttribute('data-version');
  assert(version?.startsWith('campus-v3-'));
  await page.getByRole('button',{name:'返回对话',exact:true}).click();
  await page.getByRole('button',{name:'更多功能',exact:true}).click();
  await page.getByRole('menuitem',{name:'关于你',exact:true}).click();
  await page.getByRole('button',{name:/告诉在场一件事/}).waitFor({timeout:10000});
  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify({status:'passed',scope:'real isolated Electron startup, shared map and memory entry',mapVersion:version,pageErrors:errors}));
} finally {await app.close();}

