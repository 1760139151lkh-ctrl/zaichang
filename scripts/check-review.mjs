import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
const root=path.resolve('dist-review'), files=[];
function walk(folder) {
  for(const entry of fs.readdirSync(folder,{withFileTypes:true})) {
    const file=path.join(folder,entry.name);
    assert(!entry.isSymbolicLink(),'Deployment may not contain symlinks');
    if(entry.isDirectory()) walk(file); else files.push(file);
  }
}
walk(root);
const maps=new Set(['manifest.json','places.json','network.json','geography.geojson','display-geography.geojson','sports-details.geojson','shared-facts.json','venues.json','building-supplement.json'].map(name=>name+'.gz').concat('source.osm.json.gz'));
const licenses=new Set(['ODbL-1.0.txt','Building-data-attribution.txt','NotoSansSC-OFL.txt','MapLibre-BSD-3-Clause.txt','MapLibre-Style-Spec.txt','Earcut-ISC.txt','OpenLayers-BSD-2-Clause.txt','React-MIT.txt','ReactDOM-MIT.txt','Lucide-ISC.txt','Noble-Hashes-MIT.txt']);
for(const file of files) {
  const relative=path.relative(root,file).replaceAll(path.sep,'/');
  assert(relative==='index.html'||relative.startsWith('assets/')||relative.startsWith('map/')&&maps.has(relative.slice(4))||relative.startsWith('licenses/')&&licenses.has(relative.slice(9)),'Unexpected deployed file: '+relative);
  if(!/\.(?:woff2?|png|ico)$/.test(file)) {
    const bytes=fs.readFileSync(file);
    const text=(file.endsWith('.gz')?gunzipSync(bytes):bytes).toString('utf8');
    assert(!/(?:[A-Z]:[\\/](?:Users|Windows|Program Files|AppData)[\\/]|file:\/\/\/(?:[A-Z]:|Users\/)|-----BEGIN .*PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|sk-[A-Za-z0-9]{30,})/i.test(text),'Machine path or credential-shaped content in deployment: '+relative);
    assert(!/api\.deepseek\.com|zju\.py|sqlite|CodexZjuStudentInfo/.test(text),'Desktop/private integration in deployment: '+relative);
  }
}
const places=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'map/places.json.gz'))).toString('utf8'));
assert(places.every(p=>!p.personal),'Personal map overlay in deployment');
const manifest=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'map/manifest.json.gz'))).toString('utf8'));
assert.equal(manifest.implementation,'campus-map/v3');
console.log(JSON.stringify({status:'passed',scope:'public map artifact',files:files.length,bytes:files.reduce((n,f)=>n+fs.statSync(f).size,0),mapVersion:manifest.version,places:places.length,personalOverlay:false}));

