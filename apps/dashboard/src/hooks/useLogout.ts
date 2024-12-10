import { api } from '@/trpc/client';
import { useRouter } from 'next/navigation';

export function useLogout() {
  const router = useRouter();
  const signOut = api.auth.signOut.useMutation({
    onSuccess() {
      setTimeout(() => {
        router.push('/login');
      }, 0);
    },
  });

  return () => signOut.mutate();
}
