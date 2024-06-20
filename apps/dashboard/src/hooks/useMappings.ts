import mappings from '@/mappings.json';

export function useMappings() {
  return (val: string | string[]): string => {
    if (Array.isArray(val)) {
      return val
        .map((v) => mappings.find((item) => item.id === v)?.name ?? v)
        .join('');
    }

    return mappings.find((item) => item.id === val)?.name ?? val;
  };
}
