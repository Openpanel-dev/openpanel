import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  ALLOWED_IMAGE_CONTENT_TYPES,
  hasIcoMagicBytes,
  normalizeContentType,
  processImage,
  processOgImage,
} from './image-proxy';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

const maliciousSvg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">' +
    '<rect width="64" height="64" fill="red"/>' +
    '<script>alert(document.domain)</script>' +
    '</svg>',
);

async function makePng() {
  return sharp({
    create: {
      width: 64,
      height: 64,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  })
    .png()
    .toBuffer();
}

describe('processImage', () => {
  it('rasterizes SVG instead of serving it verbatim (GHSA-r7hx-q6f4-vj6h)', async () => {
    const result = await processImage(
      maliciousSvg,
      'https://evil.example/x.svg',
      'image/svg+xml',
    );

    expect(result.subarray(0, 4)).toEqual(PNG_MAGIC);
    expect(result.includes(Buffer.from('script'))).toBe(false);
    expect(result.includes(Buffer.from('alert'))).toBe(false);
    expect(result.equals(maliciousSvg)).toBe(false);
  });

  it('rasterizes SVG even when only the content type gives it away', async () => {
    const result = await processImage(
      maliciousSvg,
      'https://evil.example/favicon',
      'image/svg+xml',
    );

    expect(result.subarray(0, 4)).toEqual(PNG_MAGIC);
    expect(result.includes(Buffer.from('alert'))).toBe(false);
  });

  it('rasterizes small images rather than passing the bytes through', async () => {
    // A sub-5KB body used to be returned verbatim with the upstream content
    // type, which let an attacker serve arbitrary content from the API origin.
    const png = await makePng();
    expect(png.length).toBeLessThan(5000);

    const result = await processImage(
      png,
      'https://evil.example/small.png',
      'image/png',
    );

    expect(result.subarray(0, 4)).toEqual(PNG_MAGIC);
  });

  it('rejects a non-image body claiming to be an icon', async () => {
    const html = Buffer.from('<html><script>alert(1)</script></html>');

    // Sharp cannot decode it and the ICO magic bytes are absent, so it must
    // not reach the passthrough.
    expect(hasIcoMagicBytes(html)).toBe(false);
    await expect(
      processImage(html, 'https://evil.example/x.ico', 'image/x-icon'),
    ).rejects.toThrow();
  });

  it('passes a real ICO through untouched', async () => {
    // Minimal ICO header: reserved=0, type=1, count=1
    const ico = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]),
      Buffer.alloc(32),
    ]);

    const result = await processImage(
      ico,
      'https://example.com/favicon.ico',
      'image/x-icon',
    );

    expect(result).toBe(ico);
  });
});

describe('processOgImage', () => {
  it('rasterizes SVG instead of serving it verbatim', async () => {
    const result = await processOgImage(
      maliciousSvg,
      'https://evil.example/x.svg',
    );

    expect(result.subarray(0, 4)).toEqual(PNG_MAGIC);
    expect(result.includes(Buffer.from('alert'))).toBe(false);
  });

  it('rasterizes small images rather than passing the bytes through', async () => {
    const png = await makePng();
    expect(png.length).toBeLessThan(10000);

    const result = await processOgImage(png, 'https://example.com/og.png');
    expect(result.subarray(0, 4)).toEqual(PNG_MAGIC);
  });
});

describe('content type handling', () => {
  it('strips parameters and lowercases', () => {
    expect(normalizeContentType('Image/SVG+XML; charset=utf-8')).toBe(
      'image/svg+xml',
    );
    expect(normalizeContentType(null)).toBe('');
  });

  it('does not allow non-image types through the proxy', () => {
    for (const type of [
      'text/html',
      'application/json',
      'text/plain',
      'application/octet-stream',
      '',
    ]) {
      expect(ALLOWED_IMAGE_CONTENT_TYPES.has(type), type).toBe(false);
    }
  });
});
