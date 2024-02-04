import { isNumber } from 'mathjs';

export const round = (num: number, decimals = 2) => {
  const factor = Math.pow(10, decimals);
  return Math.round((num + Number.EPSILON) * factor) / factor;
};

export const average = (arr: (number | null)[]) => {
  const filtered = arr.filter(isNumber);
  return filtered.reduce((p, c) => p + c, 0) / filtered.length;
};

export const sum = (arr: (number | null)[]): number =>
  round(arr.filter(isNumber).reduce((acc, item) => acc + item, 0));

export const min = (arr: (number | null)[]): number =>
  Math.min(...arr.filter(isNumber));

export const max = (arr: (number | null)[]): number =>
  Math.max(...arr.filter(isNumber));

export const isFloat = (n: number) => n % 1 !== 0;
