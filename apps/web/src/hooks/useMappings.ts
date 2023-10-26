import mappings from '@/mappings.json'

export function useMappings() {
  return (val: string) => {
    return mappings.find((item) => item.id === val)?.name ?? val
  }
}