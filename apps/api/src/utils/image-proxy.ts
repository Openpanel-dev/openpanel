import { logger } from '@/utils/logger';
import sharp from 'sharp';

/**
 * Image normalization for the favicon/OG proxy.
 *
 * These bytes come from a third-party server and are then served from the API
 * origin, which also serves the credentialed `/trpc` and `/oauth` endpoints.
 * Anything returned verbatim is therefore attacker-controlled content on a
 * trusted origin — an SVG passed through untouched executes its `<script>` as
 * the victim. Everything Sharp can decode is rasterized to PNG, which drops
 * active content along with every other non-pixel payload.
 */

/**
 * Content types we are willing to hand back to a browser. Anything else is
 * dropped rather than proxied.
 */
export const ALLOWED_IMAGE_CONTENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/svg+xml',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/bmp',
  'image/tiff',
]);

export function normalizeContentType(raw: string | null): string {
  return (raw ?? '').split(';')[0]!.trim().toLowerCase();
}

/** Check if URL is an ICO file */
export function isIcoFile(url: string, contentType?: string): boolean {
  return (
    url.toLowerCase().endsWith('.ico') ||
    contentType === 'image/x-icon' ||
    contentType === 'image/vnd.microsoft.icon'
  );
}

/**
 * ICO is the one format Sharp cannot decode, so it is passed through raw.
 * Verify the magic bytes (reserved=0, type=1) so the passthrough cannot be
 * used to serve something that merely claims to be an icon.
 */
export function hasIcoMagicBytes(buffer: Buffer): boolean {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x00 &&
    buffer[1] === 0x00 &&
    buffer[2] === 0x01 &&
    buffer[3] === 0x00
  );
}

/** Process image with Sharp (resize to 30x30 PNG) */
export async function processImage(
  buffer: Buffer,
  originalUrl?: string,
  contentType?: string,
): Promise<Buffer> {
  // ICO is the only format Sharp cannot decode, so it is the only passthrough.
  // Everything else — SVG very much included — is rasterized.
  if (
    originalUrl &&
    isIcoFile(originalUrl, contentType) &&
    hasIcoMagicBytes(buffer)
  ) {
    logger.debug(
      { originalUrl, bufferSize: buffer.length },
      'Serving ICO file directly',
    );
    return buffer;
  }

  try {
    return await sharp(buffer)
      .resize(30, 30, {
        fit: 'cover',
      })
      .png()
      .toBuffer();
  } catch (error) {
    logger.warn(
      {
        err: error,
        originalUrl,
        bufferSize: buffer.length,
      },
      'Sharp failed to process image',
    );

    throw error;
  }
}

/** Process OG image with Sharp (resize to 300px width) */
export async function processOgImage(
  buffer: Buffer,
  originalUrl?: string,
): Promise<Buffer> {
  // Always rasterize. Returning the upstream bytes verbatim would let an
  // attacker serve arbitrary content from the API origin.
  try {
    return await sharp(buffer)
      .resize(300, null, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
  } catch (error) {
    logger.warn(
      {
        err: error,
        originalUrl,
        bufferSize: buffer.length,
      },
      'Sharp failed to process OG image',
    );

    throw error;
  }
}
