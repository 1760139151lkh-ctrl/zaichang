import { readFileSync, statSync, createHash, path } from './mapStorage';
import {
  emptyRoute,
  type MapOverview,
  type MapPoint,
  type MapGraph,
  type MapRouteQuery,
  type MapRouteResult,
  type MapEndpoint,
  type LocationStatusResult,
  type MapAccessCandidate,
} from '../shared/map-v2';
import { WalkingGraph, metersBetween, classifyFix, inBounds } from '../shared/map-routing';
import { fromLocal, toLocal, personalAccess } from './mapProfile';
import { rankMapPoints } from '../shared/map-names';
import { restoreLandscapeDetailParents, restoreRecordedRoadDisplays, retainBridgeStatusConditions, routeConditionWarning } from '../shared/map-v3';
export class CampusMapAdapter {
  private manifest: MapOverview;
  private points: MapPoint[];
  private byId: Map<string, MapPoint>;
  walking: WalkingGraph;
  private cache = new Map<string, MapRouteResult>();
  private publicPoints: MapPoint[] = [];
  private redirects: Record<string, string> = {};
  private official: Record<string, { id: string }> = {};
  private profileSignature = '';
  private originalReferences:Record<string,number[]>={};
  private baseGraph:MapGraph={version:'',nodes:[],edges:[]};
  private geography:any={features:[]};
  private sharedFacts:any;
  private publicAdapter?:CampusMapAdapter;
  private ephemeralDepth=0;
  private dataStamp=0;
  private displayGeography:object={type:'FeatureCollection',features:[]};
  private sports:object={type:'FeatureCollection',features:[]};
  constructor(private directory: string, private options: { profileDirectory?: string; profileId?: string } = {}) {
    const read = (name: string) => JSON.parse(readFileSync(path.join(directory, name), 'utf8'));
    this.points = [];
    this.manifest = {
      schemaVersion: 'campus-map/v2',
      version: 'unavailable',
      sourceDate: '',
      acquiredAt: '',
      bounds: [120.06, 30.293, 120.101, 30.326],
      campusBounds: [120.063, 30.296, 120.088, 30.319],
      label: '紫金港 · 已记录的周边',
      crs: 'EPSG:4326',
      coordinateOrder: 'longitude, latitude',
      renderProjection: 'EPSG:3857',
      distance: 'meters',
      license: 'ODbL-1.0',
      attribution: '© OpenStreetMap contributors',
      source: 'https://www.openstreetmap.org',
      copyright: 'https://www.openstreetmap.org/copyright',
      buildings: 0,
      selectable: 0,
      entrances: 0,
      connectedEntrances: 0,
      routableBuildings: 0,
      nodes: 0,
      edges: 0,
      features: 0,
      rejected: {},
      limitations: [],
    };
    let walking: WalkingGraph | undefined;
    try {
      const manifest: MapOverview = read('manifest.json');
      if (manifest.schemaVersion !== 'campus-map/v2') throw new Error('incompatible');
      this.manifest = { ...manifest, dataStatus: 'ready' };
      for(const [name,expected] of Object.entries(manifest.componentHashes||{})){
        if(!/^[a-z-]+\.(json|geojson)$/.test(name))throw new Error('Invalid map component name');
        if(createHash('sha256').update(readFileSync(path.join(directory,name))).digest('hex')!==expected)throw new Error('Map components changed during load');
      }
      this.points = read('places.json');
      try {
        const facts = read('shared-facts.json');
        if (facts.version !== manifest.version) throw new Error('Shared fact version mismatch');
        this.redirects = facts.legacyPlaceRedirects || {};
        this.official = facts.officialToCanonical || {};
        this.originalReferences=facts.originalLocatorReferences||{};this.sharedFacts=facts;
        this.geography=read('geography.geojson');
        const display=read('display-geography.geojson');this.displayGeography=display;
        this.sports=restoreLandscapeDetailParents(read('sports-details.geojson'),new Set(display.features.map((f:{id?:string|number})=>String(f.id))));
      } catch (error) {
        if (manifest.implementation === 'campus-map/v3') throw error;
      }
      if (
        !Array.isArray(this.points) ||
        this.points.some(
          (p) =>
            !p ||
            typeof p.id !== 'string' ||
            typeof p.displayName !== 'string' ||
            !Array.isArray(p.coordinate) ||
            p.coordinate.length !== 2 ||
            !p.coordinate.every(Number.isFinite) ||
            !Array.isArray(p.bounds) ||
            p.bounds.length !== 4 ||
            !p.bounds.every(Number.isFinite) ||
            !Array.isArray(p.entrances),
        )
      ) {
        this.points = [];
        throw new Error('places');
      }
      const recordedGraph: MapGraph = read('network.json');
      const graph = retainBridgeStatusConditions(recordedGraph,this.geography);
      this.baseGraph=graph;
      if (graph.version !== this.manifest.version) throw new Error('version');
      walking = new WalkingGraph(graph);
      if (manifest.implementation === 'campus-map/v3')
        this.displayGeography=restoreRecordedRoadDisplays(this.displayGeography as {features:any[]},graph);
    } catch {
      this.manifest = {
        ...this.manifest,
        dataStatus: this.points.length ? 'partial' : 'error',
        dataError: '地图路网文件未能完整载入。已载入的地图仍可浏览，对话功能不受影响。',
      };
    }
    this.byId = new Map(this.points.map((p) => [p.id, p]));
    this.publicPoints = structuredClone(this.points);
    this.walking = walking || new WalkingGraph({ version: this.manifest.version, nodes: [], edges: [] });
    try{this.dataStamp=statSync(path.join(directory,'manifest.json')).mtimeMs;}catch{}
    this.refreshProfile();
  }
  private refreshData(){
    if(this.ephemeralDepth)return;
    let stamp:number;try{stamp=statSync(path.join(this.directory,'manifest.json')).mtimeMs;}catch{this.manifest.dataStatus=this.points.length?'partial':'error';this.manifest.dataError=this.points.length?'共同地图源暂不可读；保留已载入的画面，求路暂停。':'共同地图源暂不可读；请检查地图资料后重新载入。';return;}
    if(stamp===this.dataStamp)return;
    const next=new CampusMapAdapter(this.directory,this.options);
    if(next.manifest.dataStatus!=='ready'){this.manifest.dataStatus=this.points.length?'partial':'error';this.manifest.dataError=this.points.length?'共同地图正在更新或文件不一致；保留已载入画面，请稍后重试。':'共同地图文件未能完整载入；请检查地图资料后重新载入。';return;}
    this.manifest=next.manifest;this.points=next.points;this.byId=next.byId;this.walking=next.walking;this.publicPoints=next.publicPoints;this.redirects=next.redirects;this.official=next.official;this.originalReferences=next.originalReferences;this.baseGraph=next.baseGraph;this.geography=next.geography;this.displayGeography=next.displayGeography;this.sports=next.sports;this.sharedFacts=next.sharedFacts;this.profileSignature=next.profileSignature;this.dataStamp=stamp;this.cache.clear();this.publicAdapter=undefined;
  }
  private canonical(id: string) { return this.redirects[id] || this.official[id]?.id || id; }
  /** Only main supplies the explicitly connected local profile directory.
   * Tests and standalone adapters default to public data, without private IO. */
  private refreshProfile() {
    if(this.ephemeralDepth)return;this.refreshData();
    if (!this.options.profileDirectory) return;
    try {
      const root = this.options.profileDirectory;
      const config = JSON.parse(readFileSync(path.join(root, 'profiles/config.json'), 'utf8'));
      if(this.options.profileId)config.active=this.options.profileId;
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(config.active)) throw new Error('Invalid profile id');
      const raw = readFileSync(path.join(root, 'profiles', config.active + '.json'));
      const revision = createHash('sha256').update(raw).digest('hex').slice(0,16);
      const signature = config.active + ':' + revision;
      if (signature === this.profileSignature) return;
      const profile = JSON.parse(raw.toString('utf8'));
      this.points = structuredClone(this.publicPoints);
      this.byId = new Map(this.points.map(p => [p.id,p]));
      const moved=new Set<string>();
      for (const [id, value] of Object.entries(profile.records || {})) {
        const record = value as { name?: string; note?: string; aliases?: string[];e_m?:number;n_m?:number };
        let p = this.byId.get(this.canonical(id));
        if(typeof record.name!=='string')continue;
        if(!p&&id.startsWith('u-')&&Number.isFinite(record.e_m)&&Number.isFinite(record.n_m)){
          const c=fromLocal(record.e_m!,record.n_m!);p={id,displayName:record.name,aliases:[],kind:'landmark',coordinate:c,bounds:[...c,...c],entrances:[],accessCandidates:[],source:{url:'local-personal-profile'},geometryStatus:'reference-point'};this.points.push(p);this.byId.set(id,p);moved.add(id);
        }
        if(!p)continue;
        p.aliases = [...new Set([p.displayName, ...p.aliases, ...(record.aliases || [])])];
        p.displayName = record.name.slice(0,160); p.personal = {basis:'user',note:record.note?.slice(0,6000),roles:[]};
        if(Number.isFinite(record.e_m)&&Number.isFinite(record.n_m)){
          const baseline=this.originalReferences[id]||toLocal(p.coordinate);
          if(Math.hypot(record.e_m!-baseline[0],record.n_m!-baseline[1])>.2){p.coordinate=fromLocal(record.e_m!,record.n_m!);p.personal.referencePoint=true;moved.add(p.id);if(p.roadReference){delete p.roadReference;p.kind='landmark';}if(p.geometryStatus==='reference-point')p.bounds=[...p.coordinate,...p.coordinate];}
        }
      }
      for (const [roleKey,value] of Object.entries(profile.roles || {})) {
        const role = value as { place_id?: string; label?: string };
        const p = role.place_id && this.byId.get(this.canonical(role.place_id));
        if (!p || !role.label) continue;
        const label = role.label.slice(0,40);
        p.personal = {...p.personal,basis:'user',roles:[...(p.personal?.roles || []),label],roleKeys:[...(p.personal?.roleKeys||[]),roleKey]};
        p.aliases = [...new Set([...p.aliases,label])];
      }
      for(const p of this.points) if(p.personal?.roles?.length) p.displayName=p.personal.roles.join(' / ')+' · '+p.displayName;
      this.walking=new WalkingGraph(personalAccess(this.points,this.baseGraph,this.geography,moved));
      for(const p of this.points)if(p.nearbyRoadReferences)p.nearbyRoadReferences=p.nearbyRoadReferences.flatMap(ref=>{
        const point=this.byId.get(ref.id);if(!point?.roadReference)return [];
        const straightM=metersBetween(p.coordinate,point.coordinate);return straightM<=150?[{id:ref.id,straightM}]:[];
      });
      this.manifest.profileRevision = revision;this.manifest.profileName = String(profile.profile_name || '我的校园');
      this.profileSignature=signature;this.cache.clear();
    } catch {
      // Never keep a prior person's names after an unreadable profile switch.
      this.points=structuredClone(this.publicPoints);this.byId=new Map(this.points.map(p=>[p.id,p]));
      this.walking=new WalkingGraph(this.baseGraph);
      this.manifest.profileRevision='unavailable';this.manifest.profileName=undefined;this.profileSignature='';this.cache.clear();
    }
  }
  allPoints() { this.refreshProfile(); return structuredClone(this.points); }
  dataset():import('../shared/map-v3').MapDataset {this.refreshProfile();return structuredClone({manifest:this.manifest,places:this.points,geography:this.displayGeography,sports:this.sports,venues:this.sharedFacts?.venues||[]});}
  // Send the large immutable display mesh as one value across contextBridge.
  // Copying/freezing hundreds of thousands of nested vertex arrays in the
  // isolated preload world stalls the first usable frame. JSON is decoded in
  // the renderer; the ordinary object API remains available for compatibility.
  serializedDataset():string {this.refreshProfile();return JSON.stringify({manifest:this.manifest,places:this.points,geography:this.displayGeography,sports:this.sports,venues:this.sharedFacts?.venues||[]});}
  /** Public model tools must not inherit the local UI's private profile. */
  publicView(){return this.options.profileDirectory?(this.publicAdapter ||= new CampusMapAdapter(this.directory)):this;}
  sharedSnapshot(){this.refreshProfile();return {manifest:this.overview(),places:this.allPoints(),facts:this.sharedFacts};}
  verificationGraph(){this.refreshProfile();return structuredClone(this.walking.graph);}
  routeReferences(query:MapRouteQuery,references:{id:string;name:string;coordinate:[number,number]}[]){
    this.refreshProfile();
    const prior={points:this.points,byId:this.byId,walking:this.walking};
    this.ephemeralDepth++;
    try {
      const added:MapPoint[]=references.map(r=>{
        if(!r.id.startsWith('reference/')||!r.coordinate.every(Number.isFinite)||!inBounds(r.coordinate,this.manifest.bounds))throw new Error('参考点不在地图有效范围内。');
        return {id:r.id,displayName:r.name.slice(0,80),aliases:[],kind:'node',coordinate:r.coordinate,bounds:[...r.coordinate,...r.coordinate],entrances:[],accessCandidates:[],source:{url:'local-reference'},geometryStatus:'reference-point'};
      });
      this.points=[...this.points,...added];this.byId=new Map(this.points.map(p=>[p.id,p]));this.walking=new WalkingGraph(personalAccess(this.points,this.walking.graph,this.geography,new Set(added.map(p=>p.id))));
      const route=this.route(query);return {route,graph:structuredClone(this.walking.graph)};
    } finally {this.points=prior.points;this.byId=prior.byId;this.walking=prior.walking;this.ephemeralDepth--;}
  }
  overview() {
    this.refreshProfile(); return structuredClone(this.manifest);
  }
  point(id: string) {
    this.refreshProfile(); const value = this.byId.get(this.canonical(id));
    return value ? structuredClone(value) : undefined;
  }
  /** Public geometry candidates, never a connection from the user's position. */
  nearbyConnectedPlaces(id: string, radiusMeters = 500, limit = 4) {
    const reference = this.byId.get(id);
    if (!reference) return [];
    return this.points.filter(point => point.id !== id && point.entrances.some(entrance => entrance.connected))
      .map(point => ({ point, distance: metersBetween(reference.coordinate, point.coordinate) }))
      .filter(item => item.distance <= Math.min(1000, radiusMeters)).sort((a, b) => a.distance - b.distance)
      .slice(0, Math.min(6, limit)).map(item => structuredClone(item.point));
  }
  deviceCandidates(coordinate: [number, number], accuracy: number) {
    if (!Number.isFinite(accuracy) || accuracy > 150 || accuracy < 0) return [];
    const latitude = accuracy / 111000, longitude = latitude / Math.max(0.1, Math.cos(coordinate[1] * Math.PI / 180));
    return this.points.filter(point => coordinate[0] + longitude >= point.bounds[0] && coordinate[0] - longitude <= point.bounds[2] && coordinate[1] + latitude >= point.bounds[1] && coordinate[1] - latitude <= point.bounds[3]).slice(0, 4).map(point => structuredClone(point));
  }
  search(query: string, limit = 20) {
    this.refreshProfile();
    return structuredClone(rankMapPoints(this.points,query).slice(0,Math.max(1,Math.min(50,limit))));
  }
  locationStatus(): LocationStatusResult {
    return {
      status: 'idle',
      source: 'windows-native',
      phoneConnected: false,
      reason: '可在地图中读取 Windows 本机位置；模型工具不读取或保存坐标，也可以手动选择起点。',
    };
  }
  private resolve(e?: MapEndpoint): MapPoint | undefined {
    if (e?.kind === 'place') return this.byId.get(this.canonical(e.id));
    if (e?.kind === 'node') {
      const n = this.walking.nodes.get(e.id);
      if (!n) return;
      return {
        id: `node/${n.id}`,
        displayName: n.name || '已确认的道路点',
        aliases: [],
        kind: 'node',
        coordinate: n.coordinate,
        bounds: [...n.coordinate, ...n.coordinate],
        entrances: [
          {
            id: n.id,
            name: n.name || '道路点',
            coordinate: n.coordinate,
            connected: true,
            source: `https://www.openstreetmap.org/node/${n.id}`,
          },
        ],
        source: { url: `https://www.openstreetmap.org/node/${n.id}` },
        geometryStatus: 'mapped',
      };
    }
  }
  route(query: MapRouteQuery): MapRouteResult {
    this.refreshProfile();
    if(query.from?.kind==='current'&&query.from.fix){
      const fix=query.from.fix;
      const quality=classifyFix(fix,this.manifest.bounds);
      if(quality!=='fresh')return {...emptyRoute(),status:quality==='outside'?'outside':'origin_confirmation',reason:quality==='outside'?'设备位置在当前覆盖范围之外；仍可手动选择两点。':quality==='stale'?'设备位置已过期；请选择手动起点或重新定位。':'设备位置格式无效或误差较大；请选择手动起点。'};
      const id='reference/device/'+createHash('sha256').update(JSON.stringify([fix.coordinate,fix.timestamp])).digest('hex').slice(0,16);
      return this.routeReferences({...query,from:{kind:'place',id}},[{id,name:'本机设备位置',coordinate:fix.coordinate}]).route;
    }
    const start = performance.now(),
      from = this.resolve(query.from),
      to = this.resolve(query.to);
    const base: MapRouteResult = {
      ...emptyRoute(),
      from,
      to,
      source: { version: this.manifest.version, kind: 'osm', date: this.manifest.sourceDate },
      profileRevision: this.manifest.profileRevision,
    };
    const fail = (status: MapRouteResult['status'], reason: string) => ({
      ...base,
      status,
      reason,
      elapsedMs: performance.now() - start,
    });
    if (this.manifest.dataStatus !== 'ready') return fail('error', this.manifest.dataError || '路网未载入。');
    if (query.version && query.version !== this.manifest.version)
      return fail('error', '地图数据已更新，请重新选择起终点。');
    if (query.profileRevision && query.profileRevision !== this.manifest.profileRevision)
      return fail('error','地点名称已更新，请刷新地点后重新求路。');
    if (!query.to) return fail('missing_destination', '请选择目的地。');
    if (!to) return fail('outside', '这个地点不在当前地图的数据范围内。');
    if (!query.from) return fail('missing_origin', '请选择起点，或开启本机定位。');
    if (query.from.kind === 'current')
      return fail(
        'origin_confirmation',
        '位置已显示；尚未确认你到路网的步行连接，请选择你实际所在、且有已知入口的建筑作为起点。',
      );
    if (!from) return fail('outside', '起点不在当前地图的数据范围内。');
    if (from.id === to.id) return fail('same', '起点与终点是同一地点，无需绘制路线。');
    const access = (point: MapPoint, chosen?: string): MapAccessCandidate[] => {
      const recorded: MapAccessCandidate[] = point.accessCandidates ?? point.entrances.filter(e=>e.connected).map(e=>({id:'entrance/'+e.id,nodeId:e.id,kind:'entrance' as const,name:e.name,coordinate:e.coordinate,coordinates:[e.coordinate],meters:0,source:e.source}));
      return recorded.filter(e=>(!chosen || e.id===chosen) && (query.allowConditional || !e.conditions?.length) && (!query.avoidStairs || !e.stairs));
    };
    const a = access(from,query.originAccessId), b = access(to,query.destinationAccessId);
    if (!a.length || !b.length) {
      const result = fail(
        'unknown_entrance',
        (!a.length ? from : to).accessReviewBasis || `当前限制下，${!a.length ? from.displayName : to.displayName}的道路接入还待核实。可以继续浏览或另选地点。`,
      );
      result.roadReferences=([['origin',from,a,b],['destination',to,b,a]] as const).flatMap(([endpoint,place,choices,other])=>choices.length?[]:(place.nearbyRoadReferences||[]).flatMap(ref=>{
        const point=this.byId.get(ref.id);if(!point?.roadReference)return [];
        const straightM=metersBetween(place.coordinate,point.coordinate);if(straightM>150)return [];
        if(other.length){
          const node=point.roadReference.nodeId,otherNodes=other.map(c=>c.nodeId);
          const linked=this.walking.shortest(endpoint==='origin'?[node]:otherNodes,endpoint==='origin'?otherNodes:[node],query.avoidStairs,undefined,undefined,query.allowConditional);
          if(!linked)return [];
        }
        return [{endpoint,point,straightM,forPlace:place.displayName}];
      }).slice(0,2));
      if(result.roadReferences.length)result.reason+= '也可以明确改选附近的道路点。';
      result.warnings.push('没有合格的已记录入口或80米内避障接入；未用穿墙、穿水的直线补路。附近道路参考点是明确另选的起终点，不是楼门。');
      if (!a.length && b.length) result.conditionalOrigins = this.nearbyConnectedPlaces(from.id).filter(point => point.id !== to.id).flatMap(point => {
        const candidate = this.route({ from: { kind: 'place', id: point.id }, to: query.to, avoidStairs: query.avoidStairs });
        if (candidate.status !== 'ready' || !candidate.distance || !candidate.originEntrance || !candidate.destinationEntrance) return [];
        const networkM = candidate.distance.networkM;
        const entrance = (value: NonNullable<MapRouteResult['originEntrance']>) => ({ id: value.id, name: value.name, connected: value.connected, source: value.source });
        return [{ id: point.id, label: point.displayName, originEntrance: entrance(candidate.originEntrance), destinationEntrance: entrance(candidate.destinationEntrance),
          networkM, minutes: { min: Math.ceil(networkM / 90), max: Math.ceil(networkM / 48) }, connection: 'unknown' as const,
          condition: '这段路从所列候选建筑自身已记录的连通入口到目的建筑入口；只有先到该候选入口后，楼外步行区间才适用。原地点到候选入口、两端楼内及当天通行仍未知；候选入口不是原地点的已确认出口。' }];
      });
      return result;
    }
    const key = JSON.stringify([this.manifest.version,this.manifest.profileRevision,from.id,from.coordinate,to.id,to.coordinate,!!query.avoidStairs,!!query.allowConditional,query.originAccessId,query.destinationAccessId]);
    const cached = this.cache.get(key);
    if (cached) return structuredClone(cached);
    const found = this.walking.shortest(
      a.map((e) => e.nodeId),
      b.map((e) => e.nodeId),
      query.avoidStairs,
      new Map(a.map(e=>[e.nodeId,e.meters])),new Map(b.map(e=>[e.nodeId,e.meters])),query.allowConditional,
    );
    if (!found) return fail('unreachable', '已知路网中没有连通的步行路线；没有用直线替代缺失路段。');
    const used = found.edgeIds.map((id) => this.walking.edges.get(id)!);
    const originAccess=a.find(e=>e.nodeId===found.nodeIds[0])!, destinationAccess=b.find(e=>e.nodeId===found.nodeIds.at(-1))!;
    const segments: NonNullable<MapRouteResult['segments']> = [];
    if(originAccess.kind==='estimate')segments.push({id:originAccess.id,name:'出发处接入估计',coordinates:originAccess.coordinates,meters:originAccess.meters,kind:'estimate'});
    for(let i=0;i<used.length;i++) {const e=used[i];segments.push({id:e.id,name:e.name || (e.bridge?'桥梁':e.reviewedApproach?'桥头步道':e.stairs?'台阶':e.buildingPassage?'楼下通道':e.covered?'有顶步道':'校内步道'),coordinates:[found.coordinates[i],found.coordinates[i+1]],meters:e.meters,kind:'network',stairs:e.stairs,bridge:e.bridge,conditions:e.conditions});}
    if(destinationAccess.kind==='estimate')segments.push({id:destinationAccess.id,name:'抵达处接入估计',coordinates:destinationAccess.coordinates.slice().reverse(),meters:destinationAccess.meters,kind:'estimate'});
    const coordinates=segments.length?segments.flatMap((s,i)=>i?s.coordinates.slice(1):s.coordinates):found.coordinates;
    const connectorM=originAccess.meters+destinationAccess.meters;
    const networkM=used.reduce((sum,e)=>sum+e.meters,0);
    const estimateOnly=networkM===0&&connectorM>0;
    // This is a presentation distinction, not a confidence score. A tiny
    // recorded edge must not make a mostly estimated result sound surveyed.
    const estimateDominant=connectorM>0&&connectorM/(networkM+connectorM)>=.9;
    const warnings = ['按已记录且允许步行的路段长度计算；门禁、施工和实时通行请以现场为准。'];
    if (used.some((e) => e.stairs)) warnings.push('路线包含台阶。');
    if (used.some((e) => e.gate)) warnings.push('路线经过出入口，通行状态未实时核实。');
    if(connectorM>0)warnings.push('虚线为楼栋参考点至路网的避障估计；未确认真实门或楼内通行。');
    if(estimateOnly)warnings.push('两处参考点接到同一路网位置；当前结果只有接入估计，没有已记录步行路段。');
    else if(estimateDominant)warnings.push('大部分距离来自楼栋参考点接入估计；只含很短的记录道路，不能据此确认实际走法。');
    if(query.allowConditional){
      const warning=routeConditionWarning([...used.flatMap(e=>e.conditions||[]),...(originAccess.conditions||[]),...(destinationAccess.conditions||[])]);
      if(warning)warnings.push(warning);
    }
    const result: MapRouteResult = {
      ...base,
      status: 'ready',
      reason: estimateOnly?'只有接入估计；没有已记录的步行路段':estimateDominant?'主要为接入估计；实际入口与走法待核':connectorM>0?'当前路网与合格接入候选中的最短估计路线':from.roadReference||to.roadReference?'当前道路参考点与已记录接入之间的路网路线':'已知入口之间的路网最短路线',
      routeBasis: estimateOnly?'access_estimate_only':estimateDominant?'access_estimate_dominant':connectorM>0?'recorded_network_with_estimates':'recorded_network',
      coordinates,
      nodeIds: found.nodeIds,
      edgeIds: found.edgeIds,
      distance: { totalM: found.meters, networkM, connectorM },
      originEntrance: originAccess.kind==='entrance'?from.entrances.find(e=>e.id===originAccess.nodeId):undefined,
      destinationEntrance: destinationAccess.kind==='entrance'?to.entrances.find(e=>e.id===destinationAccess.nodeId):undefined,
      originAccess,destinationAccess,segments,
      warnings,
      elapsedMs: performance.now() - start,
    };
    this.cache.set(key, result);
    if (this.cache.size > 128) this.cache.delete(this.cache.keys().next().value!);
    return structuredClone(result);
  }
}
