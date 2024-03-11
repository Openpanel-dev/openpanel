import { usePathname, useRouter } from 'next/navigation';

export function useSetCookie() {
  const router = useRouter();
  const pathname = usePathname();
  return (key: string, value: string, path?: string) => {
    fetch(`/api/cookie?${key}=${value}`).then(() => {
      if (path && path !== pathname) {
        router.refresh();
        router.replace(path);
      } else {
        router.refresh();
      }
    });
  };
}
