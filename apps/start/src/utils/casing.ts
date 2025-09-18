export const camelCaseToWords = (str: string) => {
  return str
    .replaceAll('_', ' ')
    .trim()
    .replaceAll(/([A-Z])/g, ' $1')
    .trim()
    .replace(/^./, (str) => str.toUpperCase())
    .replaceAll(/\s./g, (str) => str.toUpperCase());
};
