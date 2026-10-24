import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {preloadPublicMap} from './storage';
import {CampusMapAdapter} from '../../src/main/mapService';
import {emptyRoute, type MapRouteQuery} from '../../src/shared/map-v2';
import '@fontsource-variable/noto-sans-sc';

const scenes = {'overview':'校园全景','top-down':'俯视','oblique':'空间斜视','route-demo':'步行路线','building-focus':'建筑聚焦'} as const;
type Scene = keyof typeof scenes;
async function start() {
  await preloadPublicMap();
  const service = new CampusMapAdapter('map'); // No profile directory can enter this adapter.
  if (service.overview().dataStatus !== 'ready') throw new Error('地图资料校验未通过。');
  const unavailable = {status:'unavailable' as const,source:'review-web',phoneConnected:false,reason:'在线预览使用公开地点；请选择地图上的起点。'};
  window.zaichang = {
    mapOverview:async()=>service.overview(), mapPlaces:async()=>service.allPoints(),
    mapData:async()=>service.dataset(), mapDataJson:async()=>service.serializedDataset(),
    mapRoute:async (query:MapRouteQuery)=>query.from?.kind === 'current' ? {...emptyRoute(),status:'origin_confirmation',reason:unavailable.reason} : service.route(query),
    mapLocationStatus:async()=>unavailable, mapLocate:async()=>unavailable, mapStopLocation:async()=>{},
    shareMapContext:async()=>{throw new Error('在线预览只浏览公开地图。');},
    window:()=>{},
    openLink:async (url:string)=>{if (['https://www.openstreetmap.org/copyright','https://map.zju.edu.cn/index','https://docs.overturemaps.org/attribution/'].includes(url)) window.open(url,'_blank','noopener,noreferrer');},
  } as unknown as typeof window.zaichang;
  const {MapSheet} = await import('../../src/renderer/map/CampusMap');
  const requested = new URL(location.href).searchParams.get('scene');
  const scene:Scene = requested && requested in scenes ? requested as Scene : 'overview';
  const from = service.search('东3',5).find(p=>p.displayName.includes('东3'));
  const to = service.search('西1',5).find(p=>p.displayName.includes('西1'));
  const focus = service.point('way/161324040');
  const initial = scene === 'route-demo' && from && to ? service.route({from:{kind:'place',id:from.id},to:{kind:'place',id:to.id}}) : scene === 'building-focus' && focus ? {...emptyRoute(),to:focus} : emptyRoute();
  function Review() {
    const [open,setOpen] = useState(true);
    return open ? <MapSheet publicOnly initialRoute={initial} reviewScene={scene} onClose={()=>setOpen(false)} onWindowClose={()=>setOpen(false)}
      returnLabel="返回地图介绍" reviewControls={<label className="review-scenes"><span>查看</span><select aria-label="地图预览场景" value={scene} onChange={e=>{const url=new URL(location.href);url.searchParams.set('scene',e.target.value);location.assign(url.href);}}>{Object.entries(scenes).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>} /> :
      <main className="review-home"><h1>在场 · 校园地图</h1><p>浏览紫金港的建筑与道路，选择两点比较步行路线。</p><button onClick={()=>setOpen(true)}>打开地图</button><p>公开地图预览 · 个人资料保留在桌面端</p><a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a></main>;
  }
  createRoot(document.getElementById('root')!).render(<Review />);
}
start().catch(error=>{
  const root=document.getElementById('root')!;root.replaceChildren();
  const main=document.createElement('main');main.className='review-loading';main.setAttribute('role','alert');main.textContent=String(error instanceof Error?error.message:error);root.append(main);
});
