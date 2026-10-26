import sakiko from '../../前端视觉创新设计/运行素材/companion/portraits/sakiko-selected-soft-youth-edit-v3-20261025.png';
import mutsumi from '../../前端视觉创新设计/运行素材/companion/portraits/mutsumi-youth-charm-v3-20261025.png';
import uika from '../../前端视觉创新设计/运行素材/companion/portraits/uika-youth-charm-v3-20261025.png';
import umiri from '../../前端视觉创新设计/运行素材/companion/portraits/umiri-youth-charm-v3-20261025.png';
import nyamu from '../../前端视觉创新设计/运行素材/companion/portraits/nyamu-youth-charm-v3-20261025.png';
import tomori from '../../前端视觉创新设计/运行素材/companion/portraits/tomori-youth-charm-v3-20261025.png';
import anon from '../../前端视觉创新设计/运行素材/companion/portraits/anon-youth-charm-v3-20261025.png';
import rana from '../../前端视觉创新设计/运行素材/companion/portraits/rana-youth-charm-v3-20261025.png';
import soyo from '../../前端视觉创新设计/运行素材/companion/portraits/soyo-youth-charm-v3-20261025.png';
import taki from '../../前端视觉创新设计/运行素材/companion/portraits/taki-youth-charm-v3-20261025.png';

// Independently drawn portraits. The room's full-body images never supply
// these faces; selecting a picture does not rewrite the saved persona.
// Each closeup has its own avatar framing, independent of the old bust crop.
// v3 faces and per-role circular frames were reviewed at 34/48px.
// Source/purpose: 前端视觉创新设计/来源记录/2026-10-25-literary-room/portrait-youth-v3-review/root-purpose-admission.json
// Circular portrait admission does not certify freeform mattes or room figures.
const portraits: Record<string, { image: string; sha256: string; avatar?: { left: string; top: string; width: string } }> = {
  sakiko: { image: sakiko, sha256: '50ed57c7cb690ac52eb49190762f878a2b8e8db5eb75d5d3d3f220e771d86974',
    avatar: { left: '-4%', top: '-6%', width: '108%' } },
  mutsumi: { image: mutsumi, sha256: 'accf39ccc205ee077827b9ed3b24a4c67921cb693b0f20cb2037c96cad01e24c',
    avatar: { left: '-4%', top: '-6%', width: '108%' } },
  uika: { image: uika, sha256: '842725f73a3d8bd1af9941e58783a523e3adb3b7f43e21c2a9b2579f0f680257',
    avatar: { left: '-7%', top: '-10%', width: '114%' } },
  umiri: { image: umiri, sha256: '560073dc61f3dee7e48052d3f0cfe16bba041071b8b8ec2889bb7de9bdb565ef',
    avatar: { left: '-4%', top: '-6%', width: '108%' } },
  nyamu: { image: nyamu, sha256: 'ebffcd406edb975c91c7b62f0c246850340248a62828b7338a7897d48095cc72',
    avatar: { left: '-7%', top: '-10%', width: '114%' } },
  tomori: { image: tomori, sha256: '986470992b8c303016d9b7b383138d5f2c66f962fb4453939cf0feeb43c6a9b9',
    avatar: { left: '-4%', top: '-6%', width: '108%' } },
  anon: { image: anon, sha256: '132d7f7f8d513634fc45145fc2405543a8e2b9bc0df47bfad614b94381a2663c',
    avatar: { left: '-7%', top: '-10%', width: '114%' } },
  rana: { image: rana, sha256: '400f6a20398a978d24561f7b484ab03bdf4ff3951cdfa95595a78691828a9aad',
    avatar: { left: '-7%', top: '-10%', width: '114%' } },
  soyo: { image: soyo, sha256: '735d92cac98476e597a9ca6bb86df60c4de1ccf5481a88597f5d4a17e359c418',
    avatar: { left: '-7%', top: '-10%', width: '114%' } },
  taki: { image: taki, sha256: '6597cfbe08e2e4ce4906c498bcfc5d2e41d3d3910e5a8a80762c2aa53d4ed873',
    avatar: { left: '-4%', top: '-6%', width: '108%' } },
};
export function companionPortrait(character: string) {
  return Object.hasOwn(portraits, character) ? portraits[character] : undefined;
}

