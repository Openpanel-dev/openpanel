import { existsSync } from 'node:fs';
import { join } from 'node:path';

const PUBLIC_DIR = join(process.cwd(), 'public');

// Some articles have no cover, or point at a file that was never added;
// the card then draws its own placeholder instead of a broken image.
export function resolveArticleCover(cover?: string): string | undefined {
  if (!cover) {
    return undefined;
  }
  return existsSync(join(PUBLIC_DIR, cover)) ? cover : undefined;
}
