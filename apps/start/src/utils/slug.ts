// Copied from @openpanel/core/src/shared/slug.ts (ADR-007/ADR-008:
// frontend-values-only-constants forbids apps/start value-importing core
// outside a *.constants.ts path).
import _slugify from 'slugify';

const slugify = (str: string) => {
  return _slugify(
    str
      .replaceAll('å', 'a')
      .replaceAll('ä', 'a')
      .replaceAll('ö', 'o')
      .replaceAll('Å', 'A')
      .replaceAll('Ä', 'A')
      .replaceAll('Ö', 'O')
      .replace(/\|+/g, '-'),
    { lower: true, strict: true, trim: true }
  );
};

export function slug(str: string): string {
  return slugify(str);
}
