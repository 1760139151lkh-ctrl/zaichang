import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash,randomUUID } from 'node:crypto';

// Readers retain the last complete V3 snapshot while the two import phases
// run. The intermediate V2 manifest must never become the public version.
const root=path.resolve('.'),source=path.resolve(process.argv[2]||'assets/map-v2/source.osm.json.gz');
const referenceRoot=process.env.ZAICHANG_MAP_REFERENCE_DIR;
if (!referenceRoot) throw new Error('Map regeneration needs separately authorized reference data; set ZAICHANG_MAP_REFERENCE_DIR. Normal build uses the checked-in validated snapshot.');
const parent=path.join(root,'work');await fs.mkdir(parent,{recursive:true});
const realRoot=await fs.realpath(root),realParent=await fs.realpath(parent);
if(!realParent.startsWith(realRoot+path.sep))throw new Error('Map staging must remain inside this workspace');
const scratch=await fs.mkdtemp(path.join(parent,'.map-import-'));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const inputs=new Map();
async function capture(file){const bytes=await fs.readFile(file);inputs.set(file,digest(bytes));return bytes;}
async function run(executable,args,cwd){
 const result=spawnSync(executable,args,{cwd,stdio:'inherit',windowsHide:true});
 if(result.error)throw result.error;
 if(result.status!==0)throw new Error(`Map generation failed (${result.status})`);
}
async function publish(folder,name,bytes){
 if(!/^[a-z][a-z0-9.-]+$/.test(name))throw new Error('Invalid generated map filename');
 const target=path.join(root,folder,name),temporary=target+'.'+randomUUID()+'.tmp';
 await fs.mkdir(path.dirname(target),{recursive:true});
 await fs.writeFile(temporary,bytes);await fs.rename(temporary,target);
}
let complete=false;
try{
 await fs.cp(path.join(root,'assets/map-v2'),path.join(scratch,'assets/map-v2'),{recursive:true});
 await fs.mkdir(path.join(scratch,'scripts'),{recursive:true});
 for(const name of await fs.readdir(path.join(root,'scripts'))){
  if(name==='build-map-v3.py'||/^map_v3_.*\.py$/.test(name))await fs.writeFile(path.join(scratch,'scripts',name),await capture(path.join(root,'scripts',name)));
 }
 for(const name of ['core-reference.json','official-coverage-reference.json','official-locator-source.tsv','fidelity-observations.json','venue-observations.json','residential-observations.json','west-architecture-observations.json','south-architecture-observations.json']){
  const inputRoot = ['official-coverage-reference.json','official-locator-source.tsv'].includes(name) ? referenceRoot : path.join(root,'assets/map-v2');
  await fs.writeFile(path.join(scratch,'assets/map-v2',name),await capture(path.join(inputRoot,name)));
 }
 await capture(source);
 await run(process.execPath,[path.join(root,'scripts/import-map-v2.mjs'),source],scratch);
 await run('python',['-X','utf8',path.join(scratch,'scripts/build-map-v3.py')],scratch);
 await run(process.execPath,[path.join(root,'scripts/build-map-bridge.mjs'),path.join(scratch,'assets/map-v2/shared-bridge.mjs')],root);
 const asset=path.join(scratch,'assets/map-v2'),publicMap=path.join(scratch,'public/map-v2');
 const manifestBytes=await fs.readFile(path.join(asset,'manifest.json')),manifest=JSON.parse(manifestBytes);
 if(manifest.implementation!=='campus-map/v3')throw new Error('A complete V3 map is required');
 const facts=JSON.parse(await fs.readFile(path.join(asset,'shared-facts.json')));
 if(facts.version!==manifest.version)throw new Error('Map fact version mismatch');
 for(const [name,expected] of Object.entries(manifest.componentHashes||{})){
  if(!/^[a-z-]+\.(json|geojson)$/.test(name)||digest(await fs.readFile(path.join(asset,name)))!==expected)throw new Error('Incomplete generated map component');
 }
 for(const [file,expected] of inputs)if(digest(await fs.readFile(file))!==expected)throw new Error('Map inputs changed during generation; the previous map is retained');
 const assetNames=[...Object.keys(manifest.componentHashes),'shared-bridge.mjs'];
 for(const name of assetNames)await publish('assets/map-v2',name,await fs.readFile(path.join(asset,name)));
 for(const name of await fs.readdir(publicMap))if(name!=='manifest.json')await publish('public/map-v2',name,await fs.readFile(path.join(publicMap,name)));
 await publish('public/map-v2','manifest.json',manifestBytes);
 // CampusMapAdapter observes this stamp, after every dependent file is ready.
 await publish('assets/map-v2','manifest.json',manifestBytes);
 complete=true;console.log(JSON.stringify({published:manifest.version,intermediateVersionExposed:false}));
}catch(error){console.error(`Map import did not complete. Generation files retained at ${scratch}`);throw error;}
finally{
 if(complete){
  const realScratch=await fs.realpath(scratch);
  if(path.dirname(realScratch)!==realParent||!path.basename(realScratch).startsWith('.map-import-'))throw new Error('Unexpected map staging cleanup target');
  await fs.rm(realScratch,{recursive:true});
 }
}
