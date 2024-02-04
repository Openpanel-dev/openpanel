import { isNil } from 'ramda';

export function useNumber() {
  const locale = 'en-gb';

  return {
    format: (value: number | null | undefined) => {
      if (isNil(value)) {
        return 'N/A';
      }
      return new Intl.NumberFormat(locale, {
        maximumSignificantDigits: 20,
      }).format(value);
    },
  };
}
