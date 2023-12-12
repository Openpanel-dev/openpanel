export const round = (num: number, decimals = 2) => {
  const factor = Math.pow(10, decimals);
  return Math.round((num + Number.EPSILON) * factor) / factor;
};

export const average = (arr: number[]) =>
  arr.reduce((p, c) => p + c, 0) / arr.length;

export const sum = (arr: number[]) =>
  round(arr.reduce((acc, item) => acc + item, 0));

export const isFloat = (n: number) => n % 1 !== 0;
