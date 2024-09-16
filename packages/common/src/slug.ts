import _slugify from 'slugify';

const slugify = (str: string) => {
  return _slugify(
    str
      .replace('å', 'a')
      .replace('ä', 'a')
      .replace('ö', 'o')
      .replace('Å', 'A')
      .replace('Ä', 'A')
      .replace('Ö', 'O'),
    { lower: true, strict: true, trim: true },
  );
};

export function slug(str: string): string {
  return slugify(str);
}
