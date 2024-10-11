import { isNumber } from 'mathjs';

export const round = (num: number, decimals = 2) => {
  const factor = 10 ** decimals;
  return Math.round((num + Number.EPSILON) * factor) / factor;
};

export const average = (arr: (number | null)[]) => {
  const filtered = arr.filter(
    (n): n is number =>
      isNumber(n) && !Number.isNaN(n) && Number.isFinite(n) && n !== 0,
  );
  const avg = filtered.reduce((p, c) => p + c, 0) / filtered.length;
  return Number.isNaN(avg) ? 0 : avg;
};

export const sum = (arr: (number | null | undefined)[]): number =>
  round(arr.filter(isNumber).reduce((acc, item) => acc + item, 0));

export const min = (arr: (number | null)[]): number =>
  Math.min(...arr.filter(isNumber));

export const max = (arr: (number | null)[]): number =>
  Math.max(...arr.filter(isNumber));

export const isFloat = (n: number) => n % 1 !== 0;
