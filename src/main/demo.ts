import type { Message } from '../shared/types';
import { emptyRoute, type MapCard } from '../shared/map-v2';
import type { CampusMapAdapter } from './mapService';

async function pause(signal: AbortSignal, ms = 420) {
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}
export async function runDemo(
  input: string,
  m: Message,
  signal: AbortSignal,
  publish: () => void,
  map?: CampusMapAdapter,
  mapCard?: (card: MapCard) => void,
) {
  const mapIntent = /地图|怎么走|路线|步行|从.+到|位置|在哪儿|map|route|walk/i.test(input);
  m.obligations = [];
  m.actions = [];
  if (mapIntent && map && mapCard) mapCard({kind:'route',route:emptyRoute('打开地图后选择目的地；无需等待模型，即可直接操作。')});
  let text: string;
  if (mapIntent) {
    text = '校园地图可以直接打开。搜索或点一栋建筑，再选“两点路线”，就能从起点看到终点。\n\n起点由你在地图上选择；路线会保留数据里还不明确的入口和连接。';
  } else {
    const excerpt = Array.from(input.trim());
    const quote = (excerpt.slice(0, 100).join('') + (excerpt.length > 100 ? '…' : ''))
      .replace(/[\\`*_{}\[\]()#+.!|>$~\-]/g, '\\$&');
    text = `${quote ? `你刚写的「${quote}」先留在这段对话里。` : '想说的话，可以先留在这段对话里。'}\n\n现在还没有模型来接着理解。到“连接”里选好模型后，就能沿着这里继续聊，不用重新写一遍。`;
  }
  for (const part of text.match(/.{1,18}|\n/g) || []) {
    await pause(signal, 12);
    m.content += part;
    publish();
  }
}
