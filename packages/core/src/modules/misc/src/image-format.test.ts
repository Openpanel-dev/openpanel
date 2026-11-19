import { describe, expect, it } from 'bun:test';
import { contentTypeFor, detectImageFormat } from './image-format';

const ACCEPTED: Record<string, Buffer> = {
  png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]),
  jpeg: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
  gif: Buffer.from('GIF89a', 'ascii'),
  webp: Buffer.concat([
    Buffer.from('RIFF', 'ascii'),
    Buffer.from([0x10, 0, 0, 0]),
    Buffer.from('WEBPVP8 ', 'ascii'),
  ]),
  ico: Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]),
};

const REFUSED: Record<string, Buffer> = {
  svg: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
  html: Buffer.from('<html><script>alert(1)</script></html>'),
  json: Buffer.from('{"error":"not found"}'),
  'riff without webp': Buffer.concat([
    Buffer.from('RIFF', 'ascii'),
    Buffer.from([0x10, 0, 0, 0]),
    Buffer.from('WAVEfmt ', 'ascii'),
  ]),
  'cursor (ico type 2)': Buffer.from([0x00, 0x00, 0x02, 0x00]),
  empty: Buffer.alloc(0),
};

describe('detectImageFormat', () => {
  it('recognises the raster formats icon services return', () => {
    for (const [format, bytes] of Object.entries(ACCEPTED)) {
      expect(detectImageFormat(bytes)).toBe(format as never);
    }
  });

  it('refuses anything that is not a raster image', () => {
    for (const [name, bytes] of Object.entries(REFUSED)) {
      expect([name, detectImageFormat(bytes)]).toEqual([name, null]);
    }
  });

  it('maps every format to an image/* content type', () => {
    for (const format of Object.keys(ACCEPTED)) {
      expect(contentTypeFor(format as never)).toMatch(/^image\//);
    }
  });
});
