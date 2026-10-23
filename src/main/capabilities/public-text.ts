import { createHash } from 'node:crypto';
import { MIMEType } from 'node:util';
import { HarnessError } from '../../shared/harness';

type EncodingSource = 'bom' | 'http_charset' | 'html_meta' | 'xml_declaration' | 'xml_signature' | 'default_utf8';
type EncodingChoice = { label: string; source: EncodingSource };

export interface PublicTextDecoding {
  version: '1';
  encoding: string;
  source: EncodingSource;
  entityBasis: 'http_entity_after_content_encoding';
  entitySha256: string;
  entityBytes: number;
}

const asciiSpace = (character: string | undefined) => character !== undefined && /[\t\n\f\r ]/.test(character);
const encodingError = (message: string) => new HarnessError('public_text_encoding', message, 'read');

function byteOrderMark(bytes: Uint8Array): EncodingChoice | undefined {
  // Do not mistake an unsupported UTF-32 BOM for its UTF-16 prefix.
  if (bytes[0] === 0xff && bytes[1] === 0xfe && bytes[2] === 0 && bytes[3] === 0)
    return { label: 'utf-32le', source: 'bom' };
  if (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 0xfe && bytes[3] === 0xff)
    return { label: 'utf-32be', source: 'bom' };
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { label: 'utf-8', source: 'bom' };
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { label: 'utf-16le', source: 'bom' };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { label: 'utf-16be', source: 'bom' };
}

function tagAttributes(text: string, start: number) {
  const attributes = new Map<string, string>();
  let cursor = start;
  while (cursor < text.length) {
    while (asciiSpace(text[cursor]) || text[cursor] === '/') cursor++;
    if (text[cursor] === '>') return { attributes, end: cursor + 1 };
    const nameStart = cursor;
    while (cursor < text.length && !asciiSpace(text[cursor]) && !['/', '>', '='].includes(text[cursor])) cursor++;
    const name = text.slice(nameStart, cursor).toLowerCase();
    while (asciiSpace(text[cursor])) cursor++;
    let value = '';
    if (text[cursor] === '=') {
      cursor++;
      while (asciiSpace(text[cursor])) cursor++;
      const quote = text[cursor] === '"' || text[cursor] === "'" ? text[cursor++] : undefined;
      const valueStart = cursor;
      if (quote) {
        while (cursor < text.length && text[cursor] !== quote) cursor++;
        if (cursor === text.length) return;
        value = text.slice(valueStart, cursor++);
      } else {
        while (cursor < text.length && !asciiSpace(text[cursor]) && text[cursor] !== '>') cursor++;
        value = text.slice(valueStart, cursor);
      }
    }
    // HTML's first attribute with a given name wins, including boolean ones.
    if (name && !attributes.has(name)) attributes.set(name, value);
    if (cursor === nameStart) cursor++;
  }
}

function htmlEncoding(bytes: Uint8Array): EncodingChoice | undefined {
  // Encoding labels and HTML tag syntax use ASCII bytes. This is a prescan,
  // not a decoding of page text or execution of its scripts.
  const text = Buffer.from(bytes.buffer, bytes.byteOffset, Math.min(bytes.byteLength, 1024)).toString('latin1');
  let cursor = 0;
  while (cursor < text.length) {
    const start = text.indexOf('<', cursor);
    if (start < 0) return;
    if (text.startsWith('<!--', start)) {
      const end = text.indexOf('-->', start + 4);
      if (end < 0) return;
      cursor = end + 3;
      continue;
    }
    let nameStart = start + 1;
    if (text[nameStart] === '/') nameStart++;
    if (!/[A-Za-z]/.test(text[nameStart] || '')) {
      if (text[nameStart] === '!' || text[nameStart] === '?') {
        const end = text.indexOf('>', nameStart + 1);
        if (end < 0) return;
        cursor = end + 1;
      } else cursor = start + 1;
      continue;
    }
    let nameEnd = nameStart;
    while (nameEnd < text.length && !asciiSpace(text[nameEnd]) && !['/', '>'].includes(text[nameEnd])) nameEnd++;
    const parsed = tagAttributes(text, nameEnd);
    if (!parsed) return;
    cursor = parsed.end;
    if (nameStart !== start + 1 || text.slice(nameStart, nameEnd).toLowerCase() !== 'meta') continue;
    if (parsed.attributes.has('charset')) return { label: parsed.attributes.get('charset')!, source: 'html_meta' };
    if ((parsed.attributes.get('http-equiv') || '').toLowerCase() !== 'content-type') continue;
    const content = parsed.attributes.get('content') || '';
    const label = /charset[\t\n\f\r ]*=[\t\n\f\r ]*(?:"([^"]*)"|'([^']*)'|([^\t\n\f\r ;]+))/i.exec(content);
    if (label) return { label: label[1] ?? label[2] ?? label[3], source: 'html_meta' };
  }
}

function xmlEncoding(bytes: Uint8Array): EncodingChoice | undefined {
  if (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 0 && bytes[3] === 0x3c)
    return { label: 'utf-32be', source: 'xml_signature' };
  if (bytes[0] === 0x3c && bytes[1] === 0 && bytes[2] === 0 && bytes[3] === 0)
    return { label: 'utf-32le', source: 'xml_signature' };
  if (bytes[0] === 0 && bytes[1] === 0x3c && bytes[2] === 0 && bytes[3] === 0x3f)
    return { label: 'utf-16be', source: 'xml_signature' };
  if (bytes[0] === 0x3c && bytes[1] === 0 && bytes[2] === 0x3f && bytes[3] === 0)
    return { label: 'utf-16le', source: 'xml_signature' };
  if (bytes[0] !== 0x3c || bytes[1] !== 0x3f || bytes[2] !== 0x78 || bytes[3] !== 0x6d || bytes[4] !== 0x6c
    || ![0x09, 0x0a, 0x0d, 0x20].includes(bytes[5])) return;
  let end = 6;
  while (end + 1 < bytes.length && !(bytes[end] === 0x3f && bytes[end + 1] === 0x3e)) end++;
  if (end + 1 >= bytes.length) return;
  const declaration = Buffer.from(bytes.buffer, bytes.byteOffset, end).toString('latin1');
  const encoding = /[\t\n\r ]encoding[\t\n\r ]*=[\t\n\r ]*(["'])([A-Za-z][A-Za-z0-9._-]*)\1/.exec(declaration);
  if (encoding) return { label: encoding[2], source: 'xml_declaration' };
}

/** Decode the already decompressed HTTP entity. This deliberately implements
 * declared encodings and a bounded HTML prescan, not browser language detection. */
export function decodePublicText(bytes: Uint8Array, contentType: string): { text: string; decoding: PublicTextDecoding } {
  let choice = byteOrderMark(bytes);
  if (!choice) {
    let mediaType = '', charset: string | null = null;
    if (contentType.trim()) {
      try {
        const type = new MIMEType(contentType);
        mediaType = type.essence;
        charset = type.params.get('charset');
      } catch (error) {
        if (error instanceof TypeError) throw encodingError('这份资料的文本类型或编码声明还没能解析清楚。');
        throw error;
      }
    }
    choice = charset !== null ? { label: charset, source: 'http_charset' }
      : mediaType === 'text/html' ? htmlEncoding(bytes)
        : mediaType === 'text/xml' || mediaType === 'application/xml' || mediaType.endsWith('+xml') ? xmlEncoding(bytes) : undefined;
  }
  choice ||= { label: 'utf-8', source: 'default_utf8' };
  const label = choice.source === 'html_meta' && choice.label.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, '').toLowerCase() === 'x-user-defined'
    ? 'windows-1252' : choice.label;
  let decoder: TextDecoder;
  try { decoder = new TextDecoder(label, { fatal: true }); }
  catch (error) {
    if (error instanceof RangeError) throw encodingError('读到了这份资料的编码声明，但还不能按这种编码解开文字。');
    throw error;
  }
  if (choice.source === 'html_meta' && ['utf-16le', 'utf-16be'].includes(decoder.encoding))
    decoder = new TextDecoder('utf-8', { fatal: true });
  let text: string;
  try { text = decoder.decode(bytes); }
  catch (error) {
    if (error instanceof TypeError) throw encodingError('原字节和所选编码对不上，没能完整读成文字。');
    throw error;
  }
  return { text, decoding: { version: '1', encoding: decoder.encoding, source: choice.source,
    entityBasis: 'http_entity_after_content_encoding', entitySha256: createHash('sha256').update(bytes).digest('hex'), entityBytes: bytes.byteLength } };
}
