import { useNuxtApp } from '#app';

export function useOpenPanel() {
  const { $openpanel } = useNuxtApp();
  return $openpanel;
}
