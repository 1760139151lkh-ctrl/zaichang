import sakikoWhole from '../../前端视觉创新设计/运行素材/companion/edge/sakiko-meme-cat-v3.png';
import sakikoLoaf from '../../前端视觉创新设计/运行素材/companion/edge/sakiko-loaf-v1.png';
import sakikoCurl from '../../前端视觉创新设计/运行素材/companion/edge/sakiko-curl-v1.png';
import sakikoBody from '../../前端视觉创新设计/运行素材/companion/edge/sakiko-meme-cat-v3-body.png';
import sakikoTail from '../../前端视觉创新设计/运行素材/companion/edge/sakiko-meme-cat-v3-tail.png';
import mutsumiBody from '../../前端视觉创新设计/运行素材/companion/edge/mutsumi-meme-cat-v1-body.png';
import mutsumiTail from '../../前端视觉创新设计/运行素材/companion/edge/mutsumi-meme-cat-v1-tail.png';
import uikaBody from '../../前端视觉创新设计/运行素材/companion/edge/uika-meme-cat-v1-body.png';
import uikaTail from '../../前端视觉创新设计/运行素材/companion/edge/uika-meme-cat-v1-tail.png';
import umiriBody from '../../前端视觉创新设计/运行素材/companion/edge/umiri-meme-cat-v1-body.png';
import umiriTail from '../../前端视觉创新设计/运行素材/companion/edge/umiri-meme-cat-v1-tail.png';
import nyamuBody from '../../前端视觉创新设计/运行素材/companion/edge/nyamu-meme-cat-v1-body.png';
import nyamuTail from '../../前端视觉创新设计/运行素材/companion/edge/nyamu-meme-cat-v1-tail.png';
import tomoriBody from '../../前端视觉创新设计/运行素材/companion/edge/tomori-edge-meme-cat-v1-body.png';
import tomoriTail from '../../前端视觉创新设计/运行素材/companion/edge/tomori-edge-meme-cat-v1-tail.png';
import anonBody from '../../前端视觉创新设计/运行素材/companion/edge/anon-edge-meme-cat-v1-body.png';
import anonTail from '../../前端视觉创新设计/运行素材/companion/edge/anon-edge-meme-cat-v1-tail.png';
import ranaBody from '../../前端视觉创新设计/运行素材/companion/edge/rana-edge-meme-cat-v1-body.png';
import ranaTail from '../../前端视觉创新设计/运行素材/companion/edge/rana-edge-meme-cat-v1-tail.png';
import soyoBody from '../../前端视觉创新设计/运行素材/companion/edge/soyo-edge-meme-cat-v1-body.png';
import soyoTail from '../../前端视觉创新设计/运行素材/companion/edge/soyo-edge-meme-cat-v1-tail.png';
import takiBody from '../../前端视觉创新设计/运行素材/companion/edge/taki-edge-meme-cat-v1-body.png';
import takiTail from '../../前端视觉创新设计/运行素材/companion/edge/taki-edge-meme-cat-v1-tail.png';
import ranaReverseBody from '../../前端视觉创新设计/运行素材/companion/edge/rana-head-right-v1-body.png';
import ranaReverseTail from '../../前端视觉创新设计/运行素材/companion/edge/rana-head-right-v1-tail.png';
import mutsumiReverseBody from '../../前端视觉创新设计/运行素材/companion/edge/mutsumi-meme-cat-head-right-v1-body.png';
import mutsumiReverseTail from '../../前端视觉创新设计/运行素材/companion/edge/mutsumi-meme-cat-head-right-v1-tail.png';

export interface EdgeCompanionArtwork {
  id: string;
  character: string;
  label: string;
  facing: 'left' | 'right';
  mirrorSafe: boolean;
  body: string;
  tail?: string;
  whole?: string;
  canvas: readonly [number, number];
  bounds?: readonly [number, number, number, number];
  supportX?: number;
  supportY: number;
  tailOrigin?: readonly [number, number];
  sourceSha256: string;
  bodySha256: string;
  tailSha256?: string;
}
export type EdgeCompanionPose = 'stretch' | 'loaf' | 'curl';
const sakikoPoses: Partial<Record<EdgeCompanionPose, EdgeCompanionArtwork>> = {
  loaf: { id: 'sakiko-loaf-v1', character: 'sakiko', label: '祥子', facing: 'left', mirrorSafe: true,
    body: sakikoLoaf, canvas: [1536, 1024], bounds: [128, 143, 1381, 900], supportY: 890 / 1024,
    sourceSha256: '226615cd5220c2e4aee013ea662c994dfd7275f8f78236edb8c0169bf9c5728c',
    bodySha256: '84ddfa7628a51512b687a1b9fc1df2b200f4d392d2fff46910a4914999c9bdba' },
  curl: { id: 'sakiko-curl-v1', character: 'sakiko', label: '祥子', facing: 'left', mirrorSafe: true,
    body: sakikoCurl, canvas: [1536, 1024], bounds: [37, 135, 1501, 888], supportY: 878 / 1024,
    sourceSha256: '9c8ed52b58010fb32824716214746212c3bbd0de0e4e7bda4528fd0ae508d5dd',
    bodySha256: '7f29efe5e4e012489ddcac39baffebbd26f34444ece6e126b564fc61d5342ad2' },
};

// Primary-reviewed source artwork only; integrated runtime acceptance remains
// pending. These addresses never describe personality or a user's memories.
const artwork: Record<string, EdgeCompanionArtwork> = {
  sakiko: { id: 'sakiko-meme-cat-v3', character: 'sakiko', label: '祥子', facing: 'left', mirrorSafe: true,
    body: sakikoBody, tail: sakikoTail, whole: sakikoWhole,
    canvas: [1536, 1024], supportY: 846 / 1024, tailOrigin: [1354 / 1536, 658 / 1024],
    sourceSha256: '15b21bfb6c94aef1dfd8ae7b168f970fbe9998cddb705b64ac7dabdceab0c161',
    bodySha256: 'd972816533f714b4d75a50c7e60b018fab5758d608e61fb3d940cae104a502d0',
    tailSha256: '973cf9225f5e3f89ceaf3e004976968ec89036b36c534d5e2ed32ead6287250c' },
  mutsumi: { id: 'mutsumi-meme-cat-v1', character: 'mutsumi', label: '睦',
    facing: 'left', mirrorSafe: false, body: mutsumiBody, tail: mutsumiTail,
    canvas: [1536, 1024], supportY: 0.826171875, tailOrigin: [0.8815104166666666, 0.64453125],
    sourceSha256: 'd6438e8e96199328fd5302af27516881dd52f0120a40a0b22c54f05aaf2dff12',
    bodySha256: '475c605f70f6de4d95b668c380515d49ce7ba62d1eef3a64d1ddb6efeb4c4d0d', tailSha256: 'dba08bbfbbed4e5f5f8c03c6bd39d353116b8f880c9424c921b7753d66c8c970' },
  uika: { id: 'uika-meme-cat-v1', character: 'uika', label: '初华',
    facing: 'left', mirrorSafe: true, body: uikaBody, tail: uikaTail,
    canvas: [1536, 1024], supportY: 0.8271484375, tailOrigin: [0.880859375, 0.6484375],
    sourceSha256: '4e47efb50195f79286f944127aa39399749fe04f7b57f59a3b651e024463de74',
    bodySha256: '07da5395cc73220d8dbdb25de563ed4cae5a0c8128a3de144fdd20e9ac8a96c0', tailSha256: '793078af85336aee99c842e53709b8ff616767ac870989b5c8b86d4480446fef' },
  umiri: { id: 'umiri-meme-cat-v1', character: 'umiri', label: '海铃',
    facing: 'left', mirrorSafe: true, body: umiriBody, tail: umiriTail,
    canvas: [1536, 1024], supportY: 0.830078125, tailOrigin: [0.876953125, 0.646484375],
    sourceSha256: '3c12ad39fad5233c254175b61d9a91b04f28a816cf4a386a8f07c7593a2ed293',
    bodySha256: '235854f475d7e5ad8fbe0fdbd0a12ca1d8d09871ad3f2a252bd4e6de7aeaa406', tailSha256: '5548ac15850d5810168bb3f3e0cd0c8d3b6403426a03bb763ed70c48f33043ec' },
  nyamu: { id: 'nyamu-meme-cat-v1', character: 'nyamu', label: '若麦',
    facing: 'left', mirrorSafe: true, body: nyamuBody, tail: nyamuTail,
    canvas: [1536, 1024], supportY: 0.8251953125, tailOrigin: [0.884765625, 0.650390625],
    sourceSha256: '87e3c75a373ecc2b1e290a38efbf15251aba0347d483b6567fced78b8e12ca2b',
    bodySha256: 'f049acfc6b9a5727988fd001650aeaddbf854a21b45730d76480732fa880fb42', tailSha256: '4f72ed3a5d2ab289c4f1e7c2225abd415151ec225360de5056a087eb62b0d70f' },
  tomori: { id: 'tomori-edge-meme-cat-v1', character: 'tomori', label: '灯',
    facing: 'left', mirrorSafe: true, body: tomoriBody, tail: tomoriTail,
    canvas: [1536, 1024], supportY: 0.828125, tailOrigin: [0.8834635416666666, 0.6435546875],
    sourceSha256: '4abb8cf4523d23984ba816ad3d44e3024f0b4e130c21593378a85d7980af3ef3',
    bodySha256: '45824dc8831cf474ba657660ecd6c4e14581ff838367e4e664e18c0bb47297d7', tailSha256: '835eb8d421be38ebfbab3ba7df0ba54e03dce45d9829474f02333a29c17752e9' },
  anon: { id: 'anon-edge-meme-cat-v1', character: 'anon', label: '爱音',
    facing: 'left', mirrorSafe: true, body: anonBody, tail: anonTail,
    canvas: [1536, 1024], supportY: 0.833984375, tailOrigin: [0.8841145833333334, 0.654296875],
    sourceSha256: 'f56249db73c9c499914b6232bd2e6c9444cce33631f730835bfaf55606adcf7e',
    bodySha256: 'e2f9bc6831f9f6a740d826014b2262397b1546f165a3ad7aa84f69c1f08aeb42', tailSha256: 'e52e8a7c08e5f76d8eb7fac55a4ec51345be10adf5ad453d4a93f4c83d2421b4' },
  rana: { id: 'rana-edge-meme-cat-v1', character: 'rana', label: '乐奈',
    facing: 'left', mirrorSafe: false, body: ranaBody, tail: ranaTail,
    canvas: [1536, 1024], supportY: 0.826171875, tailOrigin: [0.875, 0.65625],
    sourceSha256: '9fb3fb07c6dd85e3d5657e9da51c415449bc91bd90f7a057ae1ca805f90bc28f',
    bodySha256: '0f49dd64d084726f1393133a8227df06e4a609acea85d3aa4418538c298bc75f', tailSha256: '59fe11eb046b4c6f0e3c98ffd18ec3a977804063a4e0189fbe37e8ec0219ce62' },
  soyo: { id: 'soyo-edge-meme-cat-v1', character: 'soyo', label: '素世',
    facing: 'left', mirrorSafe: true, body: soyoBody, tail: soyoTail,
    canvas: [1536, 1024], supportY: 0.830078125, tailOrigin: [0.8828125, 0.6572265625],
    sourceSha256: 'dfd7282c452eab0a921ce9188b97350f9b4ca0aa1028fd38065c70634bd3fd41',
    bodySha256: 'c5eeb93d2dda476172336fc4de637f7ff63b6d4ef4fcdddb4b7b2c2a6f234461', tailSha256: 'ef03adf22853e2f17d16cbfb7dc90bfc2c74c5169cfff9a562f9d7968e09c337' },
  taki: { id: 'taki-edge-meme-cat-v1', character: 'taki', label: '立希',
    facing: 'left', mirrorSafe: true, body: takiBody, tail: takiTail,
    canvas: [1536, 1024], supportY: 0.8310546875, tailOrigin: [0.8795572916666666, 0.66015625],
    sourceSha256: '94f804ad07e07377305e54e6ad0a55db2f9b107945b2af6c4b16d2786afb5647',
    bodySha256: '20ff50d8effd624fe694b8002a9ce1555fc2d0f0567834c57283ccd86cbe4be5', tailSha256: '98c9e77cc1981d59b5e6c08b417f2d05b81ffc7ff97b89cc41f598616eea236c' },
};

// Independent drawings retain side-specific identity. Rana's eye colours must
// never swap; Mutsumi's two drawings retain her own-left twin clips.
const oppositeFacing: Record<string, EdgeCompanionArtwork> = {
  mutsumi: { id: 'mutsumi-meme-cat-head-right-v1', character: 'mutsumi', label: '睦',
    facing: 'right', mirrorSafe: false, body: mutsumiReverseBody, tail: mutsumiReverseTail,
    canvas: [1536, 1024], supportY: 833 / 1024, tailOrigin: [230 / 1536, 626 / 1024],
    sourceSha256: '3edcb5c85458c4150e196056347c3a8214d229392fc784aad4e49f4682432b74',
    bodySha256: '850e04388eaa0fe91ad66a9e84c5a5429275ee07af5667bc063275b342a7d939',
    tailSha256: '81bdb30c9fdd87d6d16af67023abfa9fd3564a9869c1bd66868f34a2db84f3b2' },
  rana: { id: 'rana-head-right-v1', character: 'rana', label: '乐奈',
    facing: 'right', mirrorSafe: false, body: ranaReverseBody, tail: ranaReverseTail,
    canvas: [1536, 1024], supportY: 0.8125, tailOrigin: [0.12955729166666666, 0.640625],
    sourceSha256: '21a25b80c021b4ad84f3c4d896447d57af89b00819f3969869c726fcba1efa9e',
    bodySha256: '8dff799a03366dfb038e0ab5a31df8864ed698f84db0d49b53b9673fe768d336', tailSha256: '5a0f9faba65933e5fed9e47c77a5d8a0d77de4a785ba7f8609844b8957ed179a' },
};

const registeredBounds: Record<string, readonly [number, number, number, number]> = {
  'sakiko-meme-cat-v3': [41, 169, 1508, 886], 'mutsumi-meme-cat-v1': [32, 150, 1507, 886],
  'uika-meme-cat-v1': [49, 169, 1513, 883], 'umiri-meme-cat-v1': [63, 168, 1508, 887],
  'nyamu-meme-cat-v1': [42, 161, 1503, 879], 'tomori-edge-meme-cat-v1': [35, 158, 1518, 885],
  'anon-edge-meme-cat-v1': [18, 135, 1519, 915], 'rana-edge-meme-cat-v1': [48, 176, 1504, 879],
  'soyo-edge-meme-cat-v1': [27, 143, 1512, 886], 'taki-edge-meme-cat-v1': [37, 167, 1518, 876],
  'rana-head-right-v1': [33, 176, 1485, 869],
  'mutsumi-meme-cat-head-right-v1': [23, 151, 1510, 876],
};
for (const value of [...Object.values(artwork), ...Object.values(oppositeFacing)]) value.bounds = registeredBounds[value.id];


// Vertical edges reuse this admitted horizontal rig by the user's current
// quarter-turn rule. Dedicated upright sources remain historical artwork.
export function edgeCompanionArtwork(character: string, dockLeft = false, pose: EdgeCompanionPose = 'stretch'): EdgeCompanionArtwork | undefined {
  if (!Object.hasOwn(artwork, character)) return undefined;
  if (character === 'sakiko' && sakikoPoses[pose]) return sakikoPoses[pose];
  return dockLeft && Object.hasOwn(oppositeFacing, character) ? oppositeFacing[character] : artwork[character];
}
