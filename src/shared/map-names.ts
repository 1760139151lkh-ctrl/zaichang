import type { MapPoint } from './map-v2';
export function normalizeMapName(value:string){
  let s=value.toLowerCase();
  for(const [i,c] of [...'一二三四五六七八九'].entries())s=s.replaceAll(c,String(i+1));
  return s.replace(/([东西北])教([0-9]+)/g,'$1$2').replace(/教学楼|教学|号楼|宿舍|幢|舍|楼|[\s·（）()\-]/g,'');
}
export function rankMapPoints(points:MapPoint[],query:string){
  const text=query.trim(),normalized=normalizeMapName(text);
  // A category/unit query can normalize to nothing. Match its literal words
  // instead of treating it as the empty browse query.
  const normalize=normalized||!text?normalizeMapName:(value:string)=>value.trim().toLowerCase();
  const q=normalized||text.toLowerCase();
  return points.filter(p=>!p.historicalReference||!!p.personal||p.id===query).map(p=>{
    const names=[p.displayName,...p.aliases].map(normalize);
    const score=p.id===query?1000:normalize(p.displayName)===q?200:names.includes(q)?180:names.some(n=>n.startsWith(q))?100:names.some(n=>n.includes(q))?50:0;
    return {p,score};
  }).filter(v=>v.score>0).sort((a,b)=>b.score-a.score||a.p.displayName.localeCompare(b.p.displayName,'zh-CN')).map(v=>v.p);
}
export function uniqueExactMapPoint(points:MapPoint[],query:string){
  const q=normalizeMapName(query.trim());if(!q)return undefined;
  const matches=points.filter(p=>(!p.historicalReference||!!p.personal||p.id===query)&&(p.id===query||[p.displayName,...p.aliases].some(n=>normalizeMapName(n)===q)));
  return matches.length===1?matches[0]:undefined;
}
