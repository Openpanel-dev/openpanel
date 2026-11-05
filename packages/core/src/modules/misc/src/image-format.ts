// The response content type comes from the bytes, never from the upstream
// header: whatever an icon service returns is served from the api origin,
// so an HTML error page or an SVG must never go out as an image.

export type FaviconFormat = 'png' | 'jpeg' | 'webp' | 'gif' | 'ico';

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const GIF_SIGNATURE = Buffer.from('GIF8', 'ascii');
const RIFF_SIGNATURE = Buffer.from('RIFF', 'ascii');
const WEBP_SIGNATURE = Buffer.from('WEBP', 'ascii');
const WEBP_SIGNATURE_OFFSET = 8;
// Reserved field = 0, image type = 1 (icon).
const ICO_SIGNATURE = Buffer.from([0x00, 0x00, 0x01, 0x00]);

const CONTENT_TYPES: Readonly<Record<FaviconFormat, string>> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  ico: 'image/x-icon',
};

function startsWith(buffer: Buffer, signature: Buffer, offset = 0): boolean {
  return (
    buffer.length >= offset + signature.length &&
    buffer.subarray(offset, offset + signature.length).equals(signature)
  );
}

/** The raster format the bytes actually are, or `null` for anything else. */
export function detectImageFormat(buffer: Buffer): FaviconFormat | null {
  if (startsWith(buffer, PNG_SIGNATURE)) {
    return 'png';
  }
  if (startsWith(buffer, JPEG_SIGNATURE)) {
    return 'jpeg';
  }
  if (startsWith(buffer, GIF_SIGNATURE)) {
    return 'gif';
  }
  if (
    startsWith(buffer, RIFF_SIGNATURE) &&
    startsWith(buffer, WEBP_SIGNATURE, WEBP_SIGNATURE_OFFSET)
  ) {
    return 'webp';
  }
  if (startsWith(buffer, ICO_SIGNATURE)) {
    return 'ico';
  }
  return null;
}

export function contentTypeFor(format: FaviconFormat): string {
  return CONTENT_TYPES[format];
}
