import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import type { PdfCrop, PdfRequest, PdfResult, PdfTable, PdfTextItem } from './pdf';
import { boundedImageSize, MAX_RASTER_EDGE, MAX_RASTER_PIXELS } from './raster';

const ROOT = path.resolve(__dirname);
const READER_VERSION = 'pdfjs-dist6.2.108-canvas1.0.6';
const MAX_FILE_BYTES = 20_000_000;
const MAX_INPUT_BYTES = 32 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const MAX_PAGES = 200;
const MAX_TEXT_ITEMS = 20_000;
const MAX_TEXT_UNITS = 2_000_000;
const MAX_OPERATOR_COUNT = 100_000;
const MAX_DECODED_IMAGE_PIXELS = 16_000_000;
const MAX_IMAGE_EDGE = 1600;
const MAX_DATA_URL_LENGTH = 3_000_000;
const requireLocal = createRequire(path.join(ROOT, 'worker.cjs'));
const writeProtocol = process.stdout.write.bind(process.stdout);
const warnings: string[] = [];
let diagnosticBytes = 0;

function fail(code: string, message: string): never { throw Object.assign(new Error(message), { code }); }

// All library diagnostics stay off the JSON channel and never become source text.
for (const name of ['log', 'warn', 'error', 'info', 'debug'] as const) {
  console[name] = (...args: unknown[]) => {
    const line = args.map(arg => typeof arg === 'string' ? arg : '[PDF diagnostic]').join(' ').slice(0, 1024);
    if (warnings.length < 100) warnings.push(line);
    if (diagnosticBytes < 32 * 1024) { diagnosticBytes += Buffer.byteLength(line); process.stderr.write(line + '\n'); }
  };
}
const noNetwork = () => fail('MATERIAL_PDF_NETWORK', 'PDF 读取组件禁止外部网络请求。');
globalThis.fetch = noNetwork as typeof fetch;
for (const [module, methods] of [
  ['node:http', ['request', 'get']], ['node:https', ['request', 'get']],
  ['node:net', ['connect', 'createConnection']], ['node:tls', ['connect']],
  ['node:dns', ['lookup', 'resolve', 'resolve4', 'resolve6']],
] as const) {
  const api = requireLocal(module);
  for (const method of methods) api[method] = noNetwork;
}

function validateEnvelope(input: unknown): { bytes: Buffer; request: PdfRequest } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('MATERIAL_PDF_REQUEST', 'PDF 请求无效。');
  const value = input as Record<string, unknown>;
  if (value.version !== 1 || Object.keys(value).some(key => !['version', 'bytes', 'request'].includes(key))
    || typeof value.bytes !== 'string' || value.bytes.length > MAX_INPUT_BYTES
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(value.bytes)) fail('MATERIAL_PDF_REQUEST', 'PDF 请求只接受已核验的文件字节。');
  const bytes = Buffer.from(value.bytes, 'base64');
  if (!bytes.length || bytes.length > MAX_FILE_BYTES || bytes.toString('base64') !== value.bytes) {
    fail('MATERIAL_PDF_RESOURCE_LIMIT', 'PDF 文件为空或超过 20,000,000 字节读取上限。');
  }
  const request = value.request as PdfRequest;
  if (!request || typeof request !== 'object' || Array.isArray(request)
    || Object.keys(request).some(key => !['operation', 'page', 'crop', 'mediaType'].includes(key))
    || !['describe', 'read', 'table', 'render', 'prepare_image'].includes(request.operation)) fail('MATERIAL_PDF_REQUEST', '材料操作无效。');
  if (request.operation === 'prepare_image') {
    if (request.page !== undefined || request.crop !== undefined || !boundedImageSize(bytes, request.mediaType || ''))
      fail('MATERIAL_PDF_IMAGE', '图片格式、尺寸或大小不能可靠读取。');
    return { bytes, request };
  }
  if (request.mediaType !== undefined || !bytes.subarray(0, 1024).includes(Buffer.from('%PDF-')))
    fail('MATERIAL_PDF_PARSE', '材料不是可读取的 PDF 文件。');
  if (request.page !== undefined && (!Number.isInteger(request.page) || request.page < 1)) fail('MATERIAL_PDF_PAGE', 'PDF 页码必须从 1 开始。');
  if (request.crop !== undefined) {
    const crop = request.crop;
    if (request.operation !== 'render' || !crop || typeof crop !== 'object' || Array.isArray(crop)
      || Object.keys(crop).some(key => !['x', 'y', 'width', 'height'].includes(key))
      || ![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite)
      || crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0
      || crop.x + crop.width > 1 || crop.y + crop.height > 1) fail('MATERIAL_PDF_CROP', '裁剪区域须在页面内，坐标和尺寸使用 0 到 1 的比例。');
  }
  return { bytes, request };
}

type RawText = { str: string; transform: number[]; width: number; height: number; fontName: string; dir: string; hasEOL: boolean };
type Box = [number, number, number, number];
function unionBox(items: PdfTextItem[]): Box | undefined {
  if (!items.length) return;
  return [Math.min(...items.map(item => item.bboxPdfPoints[0])), Math.min(...items.map(item => item.bboxPdfPoints[1])),
    Math.max(...items.map(item => item.bboxPdfPoints[2])), Math.max(...items.map(item => item.bboxPdfPoints[3]))];
}
function normalizeBox(box: Box, viewport: { width: number; height: number }): Box {
  return box.map((value, index) => Math.max(0, Math.min(1, value / (index % 2 === 0 ? viewport.width : viewport.height)))) as Box;
}
function coordinates(raw: RawText, styles: Record<string, { ascent?: number; descent?: number; vertical?: boolean }>, viewport: any, pdfjs: any): PdfTextItem {
  const tx = pdfjs.Util.transform(viewport.transform, raw.transform);
  const height = Math.hypot(tx[2], tx[3]);
  const style = styles[raw.fontName] || {};
  const angle = Math.atan2(tx[1], tx[0]) + (style.vertical ? Math.PI / 2 : 0);
  // Some embedded fonts report both metrics as zero. Zero is missing font
  // information, not a baseline at the top of the glyph. Match PDF.js's
  // TextLayer fallback when neither usable metric is supplied.
  const ascent = Number.isFinite(style.ascent) && style.ascent! > 0 ? style.ascent! * height
    : Number.isFinite(style.descent) && style.descent! < 0 ? (1 + style.descent!) * height : .8 * height;
  const width = Math.abs(raw.width * viewport.scale);
  const ux = Math.cos(angle), uy = Math.sin(angle), vx = -uy, vy = ux;
  const left = tx[4] - ascent * vx, top = tx[5] - ascent * vy;
  const corners = [[left, top], [left + width * ux, top + width * uy],
    [left + height * vx, top + height * vy], [left + width * ux + height * vx, top + width * uy + height * vy]];
  const box: Box = [Math.min(...corners.map(p => p[0])), Math.min(...corners.map(p => p[1])),
    Math.max(...corners.map(p => p[0])), Math.max(...corners.map(p => p[1]))];
  return { text: raw.str, transform: raw.transform.slice(0, 6), bbox: normalizeBox(box, viewport), bboxPdfPoints: box,
    coordinateSpace: 'normalized_rotated_page', fontName: raw.fontName, dir: raw.dir, hasEOL: raw.hasEOL };
}

async function textLayer(page: any, viewport: any, pdfjs: any, includeMarkedContent: boolean) {
  const reader = page.streamTextContent({ includeMarkedContent, disableNormalization: true }).getReader();
  const raw: RawText[] = [];
  const styles: Record<string, { ascent?: number; descent?: number; vertical?: boolean }> = Object.create(null);
  const markedIndices = new Map<string, number[]>();
  const stack: (string | undefined)[] = [];
  let units = 0, markedCount = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      Object.assign(styles, chunk.value.styles);
      for (const item of chunk.value.items) {
        if (typeof item.str !== 'string') {
          if (++markedCount > MAX_TEXT_ITEMS * 3 || stack.length > 64) fail('MATERIAL_PDF_RESOURCE_LIMIT', 'PDF 标记结构超过读取上限。');
          if (item.type === 'endMarkedContent') stack.pop();
          else if (item.type === 'beginMarkedContent' || item.type === 'beginMarkedContentProps') stack.push(typeof item.id === 'string' ? item.id : undefined);
          continue;
        }
        units += item.str.length;
        if (raw.length >= MAX_TEXT_ITEMS || units > MAX_TEXT_UNITS) fail('MATERIAL_PDF_RESOURCE_LIMIT', 'PDF 页面的文字或文本项超过上限，未截断正文。');
        if (!Array.isArray(item.transform) || item.transform.length !== 6 || !item.transform.every(Number.isFinite)
          || !Number.isFinite(item.width) || !Number.isFinite(item.height)) fail('MATERIAL_PDF_PARSE', 'PDF 文字坐标无效。');
        const index = raw.push(item) - 1;
        for (const id of new Set(stack)) if (id) {
          const existing = markedIndices.get(id) || [];
          existing.push(index); markedIndices.set(id, existing);
        }
      }
    }
  } finally { reader.releaseLock(); }
  const items = raw.map(item => coordinates(item, styles, viewport, pdfjs));
  const text = raw.map(item => item.str + (item.hasEOL ? '\n' : '')).join('');
  return { items, text, markedIndices };
}

function taggedTables(tree: any, items: PdfTextItem[], marked: Map<string, number[]>, viewport: any, pageNumber: number): PdfTable[] {
  const tables: PdfTable[] = [];
  let visited = 0;
  const walk = (node: any, visitor: (node: any) => boolean | void, depth = 0) => {
    if (!node || typeof node !== 'object') return;
    if (++visited > 50_000 || depth > 64) fail('MATERIAL_PDF_RESOURCE_LIMIT', 'PDF 表格结构超过读取上限。');
    if (visitor(node) === false) return;
    for (const child of node.children || []) walk(child, visitor, depth + 1);
  };
  walk(tree, table => {
    if (table.role !== 'Table') return;
    const rows: (string | null)[][] = [];
    const used = new Set<number>();
    walk(table, row => {
      if (row !== table && row.role === 'Table') return false;
      if (row.role !== 'TR') return;
      const cells: (string | null)[] = [];
      walk(row, cell => {
        if (!['TH', 'TD'].includes(cell.role)) return;
        const indices = new Set<number>();
        walk(cell, content => { if (content.type === 'content' && typeof content.id === 'string') for (const i of marked.get(content.id) || []) indices.add(i); });
        const selected = [...indices].sort((a, b) => a - b);
        for (const index of selected) used.add(index);
        const text = selected.map(index => items[index].text + (items[index].hasEOL ? '\n' : '')).join('').trim();
        cells.push(text || null);
        return false;
      });
      if (cells.length) rows.push(cells);
      return false;
    });
    if (rows.length) {
      const box = unionBox([...used].map(index => items[index]));
      tables.push({ id: `tagged-p${pageNumber}-${tables.length + 1}`, rows, extraction: 'tagged_pdf', coordinateSpace: 'normalized_rotated_page',
        ...(box ? { bbox: normalizeBox(box, viewport), bboxPdfPoints: box } : {}),
        warning: '来自 PDF 表格标签；未解析跨行/跨列属性，空白与未提取文字的单元格均保留为 null，请结合页图核验。' });
    }
    return false;
  });
  return tables;
}

function geometryTables(items: PdfTextItem[], viewport: any, pageNumber: number): PdfTable[] {
  type Cell = { x: number; right: number; text: string; items: PdfTextItem[] };
  type Row = { y: number; height: number; cells: Cell[] };
  const rows: Row[] = [];
  const sorted = items.filter(item => item.text.trim()).sort((a, b) => a.bboxPdfPoints[1] - b.bboxPdfPoints[1] || a.bboxPdfPoints[0] - b.bboxPdfPoints[0]);
  for (const item of sorted) {
    const [x, y, right, bottom] = item.bboxPdfPoints;
    const height = Math.max(1, bottom - y);
    let row = rows.at(-1);
    if (!row || Math.abs(y - row.y) > Math.max(2, Math.min(height, row.height) * 0.35)) {
      row = { y, height, cells: [] }; rows.push(row);
    }
    row.cells.push({ x, right, text: item.text, items: [item] });
  }
  for (const row of rows) {
    row.cells.sort((a, b) => a.x - b.x);
    const merged: Cell[] = [];
    for (const cell of row.cells) {
      const prior = merged.at(-1);
      if (prior && cell.x - prior.right < Math.max(8, row.height * 0.8)) {
        prior.text += (/\s$/.test(prior.text) || /^\s/.test(cell.text) ? '' : ' ') + cell.text;
        prior.right = Math.max(prior.right, cell.right); prior.items.push(...cell.items);
      } else merged.push({ ...cell, items: [...cell.items] });
    }
    row.cells = merged;
  }
  const tables: PdfTable[] = [];
  for (let start = 0; start < rows.length; start++) {
    const first = rows[start];
    if (first.cells.length < 2 || first.cells.length > 32) continue;
    const anchors = first.cells.map(cell => cell.x);
    const selected: Row[] = [first];
    let end = start + 1;
    for (; end < rows.length; end++) {
      const next = rows[end], previous = selected.at(-1)!;
      if (next.cells.length !== anchors.length || next.y - previous.y > Math.max(72, previous.height * 6)
        || next.cells.some((cell, index) => Math.abs(cell.x - anchors[index]) > Math.max(8, Math.min(next.height, first.height) * 0.7))) break;
      selected.push(next);
    }
    if (selected.length < 2) continue;
    const box = unionBox(selected.flatMap(row => row.cells.flatMap(cell => cell.items)))!;
    tables.push({ id: `geometry-p${pageNumber}-${tables.length + 1}`, bbox: normalizeBox(box, viewport), bboxPdfPoints: box,
      coordinateSpace: 'normalized_rotated_page', rows: selected.map(row => row.cells.map(cell => cell.text.trim() || null)), extraction: 'pdf_geometry',
      warning: '按 PDF 文字坐标识别的表格候选；多栏、旋转、空单元格和合并单元格可能识别不全或不准，请结合页图核验。' });
    start = end - 1;
  }
  return tables;
}

async function localAsset(url: string): Promise<Uint8Array> {
  const filename = path.resolve(url);
  const assetRoot = path.join(ROOT, 'node_modules/pdfjs-dist') + path.sep;
  if (!filename.startsWith(assetRoot)) fail('MATERIAL_PDF_ASSET', 'PDF 组件请求了固定资源之外的文件。');
  const stat = await fs.lstat(filename);
  const actual = await fs.realpath(filename);
  const realAssetRoot = await fs.realpath(path.join(ROOT, 'node_modules/pdfjs-dist'));
  if (!stat.isFile() || stat.isSymbolicLink() || !actual.startsWith(realAssetRoot + path.sep) || stat.size > 32 * 1024 * 1024) {
    fail('MATERIAL_PDF_ASSET', 'PDF 本地资源无效或超过上限。');
  }
  return new Uint8Array(await fs.readFile(filename));
}

async function execute(bytes: Buffer, request: PdfRequest): Promise<PdfResult> {
  process.env.DISABLE_SYSTEM_FONTS_LOAD = '1';
  process.env.NAPI_RS_NATIVE_LIBRARY_PATH = path.join(ROOT, 'node_modules/@napi-rs/canvas-win32-x64-msvc/skia.win32-x64-msvc.node');
  const canvas = requireLocal(path.join(ROOT, 'node_modules/@napi-rs/canvas/index.js'));
  if (request.operation === 'prepare_image') {
    // Decode only the supplied bytes in this isolated, offline process. A
    // static first frame avoids persisting unbounded animation into chat.
    let decoded: any;
    try { decoded = await canvas.loadImage(bytes); }
    catch { fail('MATERIAL_PDF_IMAGE', '这张图片没有完整解码，请从原网页选另一张。'); }
    const originalSize = { width: decoded.width, height: decoded.height };
    if (![decoded.width, decoded.height].every(value => Number.isInteger(value) && value > 0 && value <= MAX_RASTER_EDGE)
      || decoded.width * decoded.height > MAX_RASTER_PIXELS) fail('MATERIAL_PDF_IMAGE', '图片解码后的尺寸超过上限。');
    const scale = Math.min(1, 2400 / decoded.width, 2400 / decoded.height);
    const width = Math.max(1, Math.round(decoded.width * scale)), height = Math.max(1, Math.round(decoded.height * scale));
    const surface = canvas.createCanvas(width, height), context = surface.getContext('2d');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height);
    context.drawImage(decoded, 0, 0, width, height);
    let dataUrl = '';
    for (const quality of [94, 88, 80]) {
      dataUrl = 'data:image/jpeg;base64,' + surface.toBuffer('image/jpeg', quality).toString('base64');
      if (dataUrl.length < MAX_DATA_URL_LENGTH) break;
    }
    if (dataUrl.length >= MAX_DATA_URL_LENGTH) fail('MATERIAL_PDF_IMAGE', '图片处理后仍超过显示上限，请从原网页选较小的图片。');
    return { pageCount: 1, originalSize, image: { kind: 'image', name: 'public-picture.jpg', mimeType: 'image/jpeg', dataUrl, width, height }, rendererVersion: READER_VERSION };
  }
  for (const name of ['DOMMatrix', 'ImageData', 'Path2D']) (globalThis as unknown as Record<string, unknown>)[name] = canvas[name];
  const pdfjs = await import(pathToFileURL(path.join(ROOT, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href);
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(ROOT, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
  class FixedAssetFactory {
    private cMapUrl: string;
    private standardFontDataUrl: string;
    private wasmUrl: string;
    constructor(options: { cMapUrl: string; standardFontDataUrl: string; wasmUrl: string }) { Object.assign(this, options); this.cMapUrl = options.cMapUrl; this.standardFontDataUrl = options.standardFontDataUrl; this.wasmUrl = options.wasmUrl; }
    async fetch({ kind, filename }: { kind: string; filename?: string }) {
      if (!filename || !/^[A-Za-z0-9_.-]+$/.test(filename) || filename.includes('..')) fail('MATERIAL_PDF_ASSET', 'PDF 资源名称无效。');
      const base = kind === 'cMapUrl' ? this.cMapUrl : kind === 'standardFontDataUrl' ? this.standardFontDataUrl : kind === 'wasmUrl' ? this.wasmUrl : undefined;
      if (!base) fail('MATERIAL_PDF_ASSET', 'PDF 资源类型无效。');
      return localAsset(path.join(base, filename));
    }
  }
  class FixedCanvasFactory {
    create(width: number, height: number) {
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width * height > MAX_DECODED_IMAGE_PIXELS) {
        fail('MATERIAL_PDF_RESOURCE_LIMIT', 'PDF 内部图像超过像素上限，未返回省略图像的页图。');
      }
      const surface = canvas.createCanvas(Math.ceil(width), Math.ceil(height));
      return { canvas: surface, context: surface.getContext('2d') };
    }
    reset(target: any, width: number, height: number) {
      if (width * height > MAX_DECODED_IMAGE_PIXELS || width <= 0 || height <= 0) fail('MATERIAL_PDF_RESOURCE_LIMIT', 'PDF 内部图像超过像素上限。');
      target.canvas.width = Math.ceil(width); target.canvas.height = Math.ceil(height);
    }
    destroy(target: any) { target.canvas.width = 0; target.canvas.height = 0; target.canvas = null; target.context = null; }
  }
  const assets = path.join(ROOT, 'node_modules/pdfjs-dist');
  const loading = pdfjs.getDocument({
    data: new Uint8Array(bytes), isEvalSupported: false, enableScripting: false, enableXfa: false, disableAutoFetch: true, disableStream: true, disableRange: true,
    useWorkerFetch: false, useSystemFonts: false, disableFontFace: true, isOffscreenCanvasSupported: false, isImageDecoderSupported: false,
    maxImageSize: MAX_DECODED_IMAGE_PIXELS, canvasMaxAreaInBytes: MAX_DECODED_IMAGE_PIXELS * 4, stopAtErrors: true,
    cMapUrl: path.join(assets, 'cmaps').replaceAll('\\', '/') + '/', cMapPacked: true,
    standardFontDataUrl: path.join(assets, 'standard_fonts').replaceAll('\\', '/') + '/',
    wasmUrl: path.join(assets, 'wasm').replaceAll('\\', '/') + '/', iccUrl: path.join(assets, 'iccs').replaceAll('\\', '/') + '/',
    CanvasFactory: FixedCanvasFactory, BinaryDataFactory: FixedAssetFactory,
  });
  let document: any;
  try {
    document = await loading.promise;
    const pageCount = document.numPages;
    if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > MAX_PAGES) fail('MATERIAL_PDF_RESOURCE_LIMIT', 'PDF 页数超过 200 页读取上限。');
    if (request.operation === 'describe') return { pageCount };
    const pageNumber = request.page ?? 1;
    if (pageNumber > pageCount) fail('MATERIAL_PDF_PAGE', 'PDF 页码超出文件范围。');
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    if (![viewport.width, viewport.height].every((n: number) => Number.isFinite(n) && n > 0 && n <= 100_000)) {
      fail('MATERIAL_PDF_RESOURCE_LIMIT', 'PDF 页面的尺寸无效或超过读取上限。');
    }
    if (request.operation === 'read' || request.operation === 'table') {
      const layer = await textLayer(page, viewport, pdfjs, request.operation === 'table');
      if (request.operation === 'read') {
        const operators = await page.getOperatorList();
        if (operators.fnArray.length > MAX_OPERATOR_COUNT) fail('MATERIAL_PDF_RESOURCE_LIMIT', 'PDF 页面的绘图指令超过读取上限。');
        const visualOps = new Set(Object.entries(pdfjs.OPS).filter(([name]) => /paint.*Image|constructPath|shadingFill/.test(name)).map(([, value]) => value));
        return { page: pageNumber, pageCount, text: layer.text, items: layer.items, extraction: 'pdf_text_layer',
          needsVisual: !layer.text.trim() || operators.fnArray.some((code: number) => visualOps.has(code)) };
      }
      const tree = await page.getStructTree();
      const tagged = tree ? taggedTables(tree, layer.items, layer.markedIndices, viewport, pageNumber) : [];
      const tables = tagged.length ? tagged : geometryTables(layer.items, viewport, pageNumber);
      return { page: pageNumber, pageCount, tables, coverage: { complete: false, reason: tagged.length
        ? '只提取当前页可关联的 PDF 表格标签；跨行、跨列与跨页结构未验证，须结合页图核验。'
        : layer.text.trim() ? '基于文字坐标的表格候选不保证任意版式完整或准确，须结合页图核验。'
          : '本页没有可提取的文字层，未执行 OCR；表格需查看真实页图。' } };
    }
    const operators = await page.getOperatorList();
    if (operators.fnArray.length > MAX_OPERATOR_COUNT) fail('MATERIAL_PDF_RESOURCE_LIMIT', 'PDF 页面的绘图指令超过读取上限。');
    const crop: PdfCrop = request.crop || { x: 0, y: 0, width: 1, height: 1 };
    const cropWidth = viewport.width * crop.width, cropHeight = viewport.height * crop.height;
    const scale = Math.min(2, MAX_IMAGE_EDGE / Math.max(cropWidth, cropHeight));
    const width = Math.max(1, Math.ceil(cropWidth * scale)), height = Math.max(1, Math.ceil(cropHeight * scale));
    if (width > MAX_IMAGE_EDGE || height > MAX_IMAGE_EDGE || width * height > MAX_IMAGE_EDGE ** 2) fail('MATERIAL_PDF_RESOURCE_LIMIT', 'PDF 页图超过像素上限。');
    const surface = canvas.createCanvas(width, height);
    await page.render({ canvasContext: surface.getContext('2d'), viewport: page.getViewport({ scale }),
      transform: [1, 0, 0, 1, -viewport.width * crop.x * scale, -viewport.height * crop.y * scale],
      background: '#ffffff', annotationMode: pdfjs.AnnotationMode.ENABLE }).promise;
    if (warnings.some(line => /exceeded maximum|unable to decode|image decoding.*failed|unsupported feature|ignoring.*image/i.test(line))) {
      fail('MATERIAL_PDF_INCOMPLETE', 'PDF 页图有未能解码或超过上限的内容，未将部分页图当作完整材料。');
    }
    let dataUrl = '';
    for (const quality of [86, 72, 58]) {
      dataUrl = 'data:image/jpeg;base64,' + surface.toBuffer('image/jpeg', quality).toString('base64');
      if (dataUrl.length < MAX_DATA_URL_LENGTH) break;
    }
    if (dataUrl.length >= MAX_DATA_URL_LENGTH) fail('MATERIAL_PDF_RESOURCE_LIMIT', 'PDF 页图超过图像输出上限。');
    return { page: pageNumber, pageCount, image: { kind: 'image', name: `PDF-page-${pageNumber}.jpg`, mimeType: 'image/jpeg', dataUrl, width, height },
      rendererVersion: READER_VERSION, ...(request.crop ? { crop: { ...crop } } : {}),
      bboxPdfPoints: [crop.x * viewport.width, crop.y * viewport.height, (crop.x + crop.width) * viewport.width, (crop.y + crop.height) * viewport.height] };
  } catch (error) {
    if ((error as { name?: string }).name === 'PasswordException') fail('MATERIAL_PDF_PASSWORD', 'PDF 需要密码，本次未读取正文。');
    throw error;
  } finally { await loading.destroy().catch(() => {}); }
}

async function main() {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_INPUT_BYTES) fail('MATERIAL_PDF_RESOURCE_LIMIT', 'PDF 输入超过读取上限。');
    chunks.push(Buffer.from(chunk));
  }
  let envelope: unknown;
  try { envelope = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { fail('MATERIAL_PDF_REQUEST', 'PDF 请求格式无效。'); }
  const { bytes, request } = validateEnvelope(envelope);
  const result = await execute(bytes, request);
  const output = JSON.stringify({ ok: true, result });
  if (Buffer.byteLength(output) > MAX_OUTPUT_BYTES) fail('MATERIAL_PDF_RESOURCE_LIMIT', 'PDF 页面结果超过输出上限，未截断正文。');
  writeProtocol(output);
}

void main().catch(error => {
  console.error(typeof error?.name === 'string' ? error.name : 'Error', typeof error?.message === 'string' ? error.message : 'PDF worker failed.');
  console.error(typeof error?.stack === 'string' ? error.stack : 'PDF worker failed.');
  const known = typeof error?.code === 'string' && /^MATERIAL_PDF_[A-Z_]+$/.test(error.code);
  writeProtocol(JSON.stringify({ ok: false, error: { code: known ? error.code : 'MATERIAL_PDF_PARSE',
    message: known ? error.message : 'PDF 无法读取，未取得完整页面结果。' } }));
  process.exitCode = 1;
});
