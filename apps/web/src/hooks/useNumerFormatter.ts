export function useNumber() {
  const locale = 'en-gb';

  return {
    format: (value: number) => {
      return new Intl.NumberFormat(locale, {
        maximumSignificantDigits: 20,
      }).format(value);
    },
  };
}
