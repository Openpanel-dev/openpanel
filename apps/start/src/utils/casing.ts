/**
 * Acronyms that should always render upper-case rather than
 * title-case when they appear as standalone words. Without this,
 * `os` → `Os`, `url` → `Url`, `id` → `Id`, which reads oddly in
 * key/value grids.
 */
const ACRONYMS = new Set([
  'os',
  'url',
  'id',
  'api',
  'ip',
  'ui',
  'uri',
  'utm',
  'sdk',
  'ssl',
  'png',
  'jpg',
  'gif',
  'csv',
  'pdf',
  'uuid',
  'ios',
]);

export const camelCaseToWords = (str: string) => {
  const titled = str
    .replaceAll('_', ' ')
    .trim()
    .replaceAll(/([A-Z])/g, ' $1')
    .trim()
    .replace(/^./, (s) => s.toUpperCase())
    .replaceAll(/\s./g, (s) => s.toUpperCase());

  // Upper-case any known acronym, operating on each space-separated
  // word so we don't accidentally match a mid-word substring.
  return titled
    .split(' ')
    .map((word) =>
      ACRONYMS.has(word.toLowerCase()) ? word.toUpperCase() : word,
    )
    .join(' ');
};
