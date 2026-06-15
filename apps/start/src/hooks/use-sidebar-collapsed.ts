import { useCookieStore } from './use-cookie-store';

// Persisted desktop sidebar collapse state (cookie-backed, SSR-safe).
export function useSidebarCollapsed() {
  const [raw, setRaw] = useCookieStore('sidebar-collapsed', 'false');
  return [
    raw === 'true',
    (value: boolean) => setRaw(value ? 'true' : 'false'),
  ] as const;
}
