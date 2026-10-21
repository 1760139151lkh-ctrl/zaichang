import type { MapPoint } from './map-v2';
import { metersBetween } from './map-routing';

/** Repeated captions from the official reference catalogues are a display
 * concern, not evidence for merging place identities or moving either point.
 * Mapped features and personal markers always retain their own captions.
 */
export function redundantReferenceCaptions(points:Iterable<MapPoint>,emphasized:ReadonlySet<string>=new Set()):Set<string>{
  const groups=new Map<string,MapPoint[]>(),numbered=new Map<string,MapPoint[]>(),hidden=new Set<string>();
  for(const p of points){
    if(p.personal||p.historicalReference||p.geometryStatus!=='reference-point'||!p.id.startsWith('official/'))continue;
    const name=p.displayName.trim();groups.set(name,[...(groups.get(name)||[]),p]);
    const part=name.match(/^(.*?)(?:[0-9]+|[一二三四五六七八九十]+)(?:幢|栋|座|舍|号楼)$/);
    if(part)numbered.set(part[1],[...(numbered.get(part[1])||[]),p]);
  }
  for(const [name,group] of groups){
    const current=group.filter(p=>!p.id.startsWith('official/legacy/'));
    for(const legacy of group.filter(p=>p.id.startsWith('official/legacy/'))){
      const nearby=current.filter(p=>metersBetween(p.coordinate,legacy.coordinate)<=30);
      if(!nearby.length)continue;
      if(emphasized.has(legacy.id))for(const p of nearby){if(!emphasized.has(p.id))hidden.add(p.id);}
      else hidden.add(legacy.id);
    }
    // A nearby numbered-building reference already carries its group name.
    // Keep a selected broad reference visible at its own recorded position.
    for(const broad of group){
      const nearby=(numbered.get(name)||[]).filter(p=>metersBetween(p.coordinate,broad.coordinate)<=30);
      if(!nearby.length)continue;
      if(emphasized.has(broad.id))for(const p of nearby){if(!emphasized.has(p.id))hidden.add(p.id);}
      else hidden.add(broad.id);
    }
  }
  return hidden;
}

export function normalizeMapName(value:string){
  let s=value.toLowerCase();
  const digits='零一二三四五六七八九';
  s=s.replace(/[一二三四五六七八九]?十[一二三四五六七八九]?/g,part=>{
    const [tens,ones]=part.split('十');
    return String((tens?digits.indexOf(tens):1)*10+(ones?digits.indexOf(ones):0));
  });
  for(const [i,c] of [...'一二三四五六七八九'].entries())s=s.replaceAll(c,String(i+1));
  return s.replace(/([东西北])教([0-9]+)/g,'$1$2').replace(/教学楼|教学|号楼|宿舍|幢|舍|楼|[\s·（）()\-]/g,'');
}
/** A collection's own public caption can qualify a local name. Do not turn an
 * arbitrary unmatched prefix into a place alias or change the place itself. */
function mapQueryTexts(query:string,scopeLabel?:string){
  const text=query.trim(),scope=scopeLabel?.split(/[·•|｜]/,1)[0].trim().replace(/\s+/g,''),compact=text.replace(/\s+/g,'');
  if(!scope||!compact.toLowerCase().startsWith(scope.toLowerCase()))return [text];
  const local=compact.slice(scope.length).replace(/^[·•:：/\-\s]+/,'');
  return local?[text,local]:[text];
}
function mapNameScore(point:MapPoint,text:string){
  const normalized=normalizeMapName(text);
  // A category/unit query can normalize to nothing. Match its literal words
  // instead of treating it as the empty browse query.
  const literalCategory=!normalized&&!!text;
  const normalize=literalCategory?(value:string)=>value.trim().toLowerCase():normalizeMapName;
  const q=normalized||text.toLowerCase();
  const names=[point.displayName,...point.aliases].map(normalize),display=normalize(point.displayName);
    // Specific public names lead category results; descriptor-only names and
    // alias-only matches remain available without taking their place.
  return literalCategory
      ?display.includes(q)?normalizeMapName(point.displayName)?200:100:names.some(n=>n.includes(q))?50:0
      :display===q?200:names.includes(q)?180:names.some(n=>n.startsWith(q))?100:names.some(n=>n.includes(q))?50:0;
}
export function rankMapPoints(points:MapPoint[],query:string,scopeLabel?:string){
  const terms=mapQueryTexts(query,scopeLabel);
  return points.filter(p=>!p.historicalReference||!!p.personal||p.id===query).map(p=>{
    if(p.id===query)return {p,score:1000,tier:4};
    const direct=mapNameScore(p,terms[0]),qualified=terms.length>1?mapNameScore(p,terms[1]):0;
    // Literal names/aliases lead contextual names, then partial matches. These
    // are lexical ranks, not confidence that an old name is today's use.
    return direct>=180?{p,score:direct,tier:3}:qualified>=180?{p,score:qualified,tier:2}
      :direct>0?{p,score:direct,tier:1}:{p,score:qualified,tier:0};
  }).filter(v=>v.score>0).sort((a,b)=>b.tier-a.tier||b.score-a.score||a.p.displayName.localeCompare(b.p.displayName,'zh-CN')).map(v=>v.p);
}
export function uniqueExactMapPoint(points:MapPoint[],query:string,scopeLabel?:string){
  for(const text of mapQueryTexts(query,scopeLabel)){
    const q=normalizeMapName(text);if(!q)continue;
    const matches=points.filter(p=>(!p.historicalReference||!!p.personal||p.id===query)&&(p.id===query||[p.displayName,...p.aliases].some(n=>normalizeMapName(n)===q)));
    if(matches.length)return matches.length===1?matches[0]:undefined;
  }
  return undefined;
}
