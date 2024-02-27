const formatter = new Intl.NumberFormat('en', {
  notation: 'compact',
});

export function getYAxisWidth(value: number) {
  if (!isFinite(value)) {
    return 7.8 + 7.8;
  }

  return formatter.format(value).toString().length * 7.8 + 7.8;
}
