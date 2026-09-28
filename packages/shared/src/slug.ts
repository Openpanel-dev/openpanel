// apps/start carried a verbatim copy of it, which is deleted. Not to be
// confused with core's slug-id.ts, which calls this.
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
