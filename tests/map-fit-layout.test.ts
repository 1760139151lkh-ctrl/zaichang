import test from 'node:test';
import assert from 'node:assert/strict';
import { captionInsets, captionLines, endpointCaptionGap, fitControlGap, fitInsets, type FitRect } from '../src/renderer/map/fit-layout';
import { nativeCaptionBounds } from '../src/renderer/map/native-caption-bounds';
const rect=(left:number,top:number,width:number,height:number):FitRect=>({left,top,width,height,right:left+width,bottom:top+height});

test('路线拟合在实际顶部控件之外预留端点名称，而不是只容纳锚点',()=>{
 const stage=rect(0,56,431,579),mode=rect(16,130,107,44);
 // The observed old native caption crosses the mode button, including more
 // than its two-pixel collision padding. This is the regression witness.
 const oldCaption=rect(85.72,160.887,63.125,19.5625);
 assert.ok(Math.min(oldCaption.bottom,mode.bottom)-Math.max(oldCaption.top,mode.top)>10);
 const caption=captionInsets(['西1教学楼'],{font:'13px sans-serif',size:13,offsetY:-27.3,padding:2,marker:13.5,maxWidthEm:14},()=>59.125);
 const result=fitInsets(stage,{top:[mode],right:[rect(370,76,44,330)],bottom:[rect(16,575,399,45)],card:rect(16,366,346,208)},caption);
 assert.equal(result.labelSpace,true);
 const topmostCaption=stage.top+result.padding.top-caption.top;
 assert.ok(topmostCaption>=mode.bottom+fitControlGap);
 assert.ok(result.padding.left+result.padding.right<stage.width);
});

test('宽面板的侧卡片只占左侧，收起窄面板底卡能释放高度',()=>{
 const caption={top:38,right:32,bottom:14,left:32};
 const wide=fitInsets(rect(0,62,1280,658),{top:[rect(28,82,312,108)],right:[rect(1206,82,48,340)],bottom:[rect(28,680,380,25)],card:rect(28,458,420,195)},caption);
 assert.equal(wide.labelSpace,true);assert.equal(wide.padding.left,28+420+fitControlGap+32);
 assert.ok(wide.padding.bottom<100);
 const stage=rect(0,56,431,579),common={top:[rect(16,76,300,98)],right:[],bottom:[]};
 const expanded=fitInsets(stage,{...common,card:rect(16,366,346,208)},caption);
 const collapsed=fitInsets(stage,{...common,card:rect(16,540,346,60)},caption);
 assert.ok(collapsed.padding.bottom<expanded.padding.bottom);
});

test('长名称按换行计算范围，多行文字整体位于端点标记上方',()=>{
 const layout={font:'13px sans-serif',size:13,offsetY:-endpointCaptionGap,padding:2,marker:13.5,maxWidthEm:14,anchor:'bottom' as const};
 const measure=(text:string)=>Array.from(text).length*13;
 const name='这是具有多行名称的校园建筑示例',short=captionInsets(['东3'],layout,measure),long=captionInsets([name],layout,measure);
 assert.equal(captionLines(name,182,measure).join(''),name);
 assert.ok(long.left>short.left);assert.ok(long.top>short.top);
 assert.equal(long.bottom,13.5);
 const oblique=captionInsets(['东3'],{...layout,scale:1.4},measure);
 assert.ok(oblique.left>short.left);assert.ok(oblique.top>short.top);
});

test('原生已排版文字框只接受完整且名称匹配的当前端点集合',()=>{
 const feature={properties:{id:'place/a',kind:'selection-name',name:'当前名称'},loadGeometry:()=>[[{x:1,y:2}]]};
 const index={bucketLayerIDs:[['endpoint-names']],sourceLayerCoder:{decode:()=> 'geojson'},loadVTLayers:()=>({geojson:{feature:()=>feature}})};
 const empty={width:600,height:800,boxKeys:[],bboxes:[]};
 const collisionIndex={grid:{...empty,boxKeys:[{bucketInstanceId:1,featureIndex:0}],bboxes:[110,140,150,160]},ignoredGrid:empty,projectAndGetPerspectiveRatio:()=>({x:130,y:170})};
 const retained={featureIndex:index,bucketIndex:0,sourceLayerIndex:0,tileID:{toUnwrapped:()=>({})}};
 const map:any={style:{placement:{transform:{width:400,height:600},retainedQueryData:{1:retained},collisionIndex}}};
 const measured=nativeCaptionBounds(map,new Map([['place/a','当前名称']]));
 assert.deepEqual(measured,{insets:{top:30,right:20,bottom:13.5,left:20},boxes:[[10,40,50,60]]});
 assert.equal(nativeCaptionBounds(map,new Map([['place/a','旧名称']])),undefined);
 assert.equal(nativeCaptionBounds(map,new Map([['place/a','当前名称'],['place/b','缺失名称']])),undefined);
 assert.equal(nativeCaptionBounds(map,new Map()),undefined);
});

test('控件或标题放不下时不假称标签可容纳，也不产生无效相机内边距',()=>{
 for(const stage of [rect(0,0,0,0),rect(0,0,100,80)]){
  const result=fitInsets(stage,{top:[rect(0,0,100,60)],right:[],bottom:[],card:rect(0,60,100,20)},{top:80,right:120,bottom:50,left:120});
  assert.equal(result.labelSpace,false);
  assert.ok(Object.values(result.padding).every(n=>Number.isFinite(n)&&n>=0));
  assert.ok(result.padding.left+result.padding.right<=Math.max(0,stage.width-1));
  assert.ok(result.padding.top+result.padding.bottom<=Math.max(0,stage.height-1));
 }
});
