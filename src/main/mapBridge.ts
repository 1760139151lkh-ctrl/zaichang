/** Local stdio adapter for the campus locator. No HTTP listener or model calls. */
import { createInterface } from 'node:readline';
import { statSync,readFileSync } from 'node:fs';
import path from 'node:path';
import { CampusMapAdapter } from './mapService';
import { fromLocal } from './mapProfile';
import { createHash } from 'node:crypto';
const directory=path.resolve(process.argv[2]||'.');
const runtimeSha256=createHash('sha256').update(readFileSync(process.argv[1])).digest('hex');
const adapters=new Map<string,CampusMapAdapter>();
for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})){
  let request:any;
  try {
    if(line.length>100000)throw new Error('Map request too large');
    request=JSON.parse(line);
    if(!['snapshot','route','graph'].includes(request.op))throw new Error('Unknown map operation');
    const profileDirectory=typeof request.profileDirectory==='string'?request.profileDirectory:undefined;
    const profileId=typeof request.profileId==='string'?request.profileId:undefined;
    const key=JSON.stringify([statSync(path.join(directory,'manifest.json')).mtimeMs,profileDirectory,profileId]);
    let adapter=adapters.get(key);
    if(!adapter){adapter=new CampusMapAdapter(directory,{profileDirectory,profileId});adapters.set(key,adapter);if(adapters.size>4)adapters.delete(adapters.keys().next().value!);}
    let value:any;
    if(request.op==='snapshot')value=adapter.sharedSnapshot();
    else if(request.op==='graph')value=adapter.verificationGraph();
    else {
      const query=request.query||{},references=[];
      for(const [endpoint,p] of Object.entries(request.references||{})){
        if(!['from','to'].includes(endpoint))throw new Error('Invalid reference endpoint');
        const v=p as any;if(!Number.isFinite(v.e_m)||!Number.isFinite(v.n_m))throw new Error('Invalid reference coordinate');
        const coordinate=fromLocal(v.e_m,v.n_m),id='reference/'+createHash('sha256').update(JSON.stringify([coordinate,v.name])).digest('hex').slice(0,16);
        references.push({id,name:String(v.name||'地图参考点'),coordinate});query[endpoint]={kind:'place',id};
      }
      value=references.length?adapter.routeReferences(query,references):{route:adapter.route(query),graph:adapter.verificationGraph()};
      if(value.route.profileRevision!==adapter.overview().profileRevision)throw new Error('个人配置在求路中变化，请重试');
    }
    process.stdout.write(JSON.stringify({id:request.id,ok:true,value:{...value,bridgeRuntimeSha256:runtimeSha256}})+'\n');
  } catch(error){process.stdout.write(JSON.stringify({id:request?.id,ok:false,error:String(error instanceof Error?error.message:error)})+'\n');}
}
