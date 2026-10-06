import path from 'node:path';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
if(process.platform==='win32' && process.arch==='x64') {
  const root=path.resolve('node_modules/electron');
  if(!fs.existsSync(path.join(root,'dist/electron.exe'))) {
    const result=spawnSync(process.execPath,[path.join(root,'install.js')],{stdio:'inherit',windowsHide:true});
    if(result.error) throw result.error;
    if(result.status!==0 || !fs.existsSync(path.join(root,'dist/electron.exe'))) throw new Error('Pinned Electron runtime installation failed.');
  }
  console.log('Pinned Windows Electron runtime ready.');
} else console.log('Review and desktop JavaScript build supported here; native desktop target is Windows x64.');

