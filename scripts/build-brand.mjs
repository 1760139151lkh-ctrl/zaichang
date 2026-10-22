import { _electron as electron } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { isolatedEnvironment } from './test-environment.mjs';

// Export the code-native SVG mark to the two Windows application icon formats.
// This isolated helper never reads the user's application profile.
const svg = await readFile('前端视觉创新设计/统一图库/原图/运行素材与品牌/mark-c2ceba84f237.svg', 'utf8');
const env = isolatedEnvironment('brand-export');
delete env.ZAICHANG_MODEL_TRANSPORT;
delete env.ZAICHANG_PROJECT_DEEPSEEK_KEY;
const app = await electron.launch({ args: [process.cwd()], env });
try {
  const base64 = await app.evaluate(async ({ BrowserWindow }, svg) => {
    const helper = new BrowserWindow({ show: false, width: 256, height: 256, frame: false, transparent: true, webPreferences: { offscreen: true, nodeIntegration: false, sandbox: true } });
    await helper.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<style>html,body{margin:0;width:100%;height:100%;background:transparent}svg{width:100%;height:100%;display:block}</style>' + svg));
    const image = await helper.webContents.capturePage();
    const result = image.resize({ width: 256, height: 256, quality: 'best' }).toPNG().toString('base64');
    helper.destroy();
    return result;
  }, svg);
  const png = Buffer.from(base64, 'base64');
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
  await writeFile('build/icon.png', png);
  await writeFile('build/icon.ico', Buffer.concat([header, png]));
  console.log('Exported code-native brand mark: build/icon.png and build/icon.ico');
} finally { await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); }
