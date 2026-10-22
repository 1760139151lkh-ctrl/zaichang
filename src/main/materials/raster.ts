/** Header checks bound decoding work; successful decoding is still required. */
export const MAX_RASTER_BYTES = 4_000_000;
export const MAX_RASTER_PIXELS = 16_000_000;
export const MAX_RASTER_EDGE = 12_000;
export type RasterMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

export function imageMagicMatches(type: string, body: Buffer) {
  const kind = /^image\/(png|jpeg|webp|gif)(?:;|$)/i.exec(type)?.[1]?.toLowerCase();
  if (kind === 'png') return body.length >= 33 && body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    && body.readUInt32BE(8) === 13 && body.subarray(12, 16).toString('latin1') === 'IHDR';
  if (kind === 'jpeg') return body.length > 4 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
  if (kind === 'gif') return body.length >= 13 && /^GIF8[79]a$/.test(body.subarray(0, 6).toString('latin1'));
  if (kind === 'webp') return body.length >= 30 && body.subarray(0, 4).toString('latin1') === 'RIFF'
    && body.subarray(8, 12).toString('latin1') === 'WEBP' && body.readUInt32LE(4) + 8 === body.length;
  return false;
}

export function imageDimensions(body: Buffer, mediaType: string): { width: number | null; height: number | null } {
  const none = { width: null, height: null };
  try {
    if (!imageMagicMatches(mediaType, body)) return none;
    if (/png/i.test(mediaType)) return { width: body.readUInt32BE(16), height: body.readUInt32BE(20) };
    if (/gif/i.test(mediaType)) return { width: body.readUInt16LE(6), height: body.readUInt16LE(8) };
    if (/webp/i.test(mediaType)) {
      const chunk = body.subarray(12, 16).toString('latin1');
      if (chunk === 'VP8X') return { width: 1 + body.readUIntLE(24, 3), height: 1 + body.readUIntLE(27, 3) };
      if (chunk === 'VP8 ' && body.subarray(23, 26).equals(Buffer.from([0x9d, 0x01, 0x2a])))
        return { width: body.readUInt16LE(26) & 0x3fff, height: body.readUInt16LE(28) & 0x3fff };
      if (chunk === 'VP8L' && body[20] === 0x2f) { const bits = body.readUInt32LE(21); return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) }; }
      return none;
    }
    let offset = 2;
    while (offset + 4 <= body.length) {
      if (body[offset] !== 0xff) return none;
      while (body[offset] === 0xff) offset++;
      const marker = body[offset++];
      if (marker === 0xda || marker === 0xd9) return none;
      if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd8) continue;
      const length = body.readUInt16BE(offset);
      if (length < 2 || offset + length > body.length) return none;
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        if (length < 8) return none;
        return { height: body.readUInt16BE(offset + 3), width: body.readUInt16BE(offset + 5) };
      }
      offset += length;
    }
  } catch { /* A truncated header is not a readable image. */ }
  return none;
}

export function boundedImageSize(body: Buffer, mediaType: string) {
  const { width, height } = imageDimensions(body, mediaType);
  return body.length > 0 && body.length <= MAX_RASTER_BYTES && width && height
    && width <= MAX_RASTER_EDGE && height <= MAX_RASTER_EDGE && width * height <= MAX_RASTER_PIXELS
    ? { width, height } : undefined;
}
