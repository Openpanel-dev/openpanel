import { useTRPC } from '@/integrations/trpc/react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouteContext, useRouter } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

export function useSessionExtension() {
  const trpc = useTRPC();
  const context = useRouteContext({
    strict: false,
  });
  const extendMutation = useMutation(trpc.auth.extendSession.mutationOptions());
  const intervalRef = useRef<NodeJS.Timeout>(null);
  const session = context.session?.session;

  useEffect(() => {
    if (!session) return;

    const extendSessionFn = () => extendMutation.mutate();

    intervalRef.current = setInterval(
      () => {
        extendMutation.mutate();
      },
      1000 * 60 * 5,
    );

    // Delay initial call a bit to prioritize other requests
    const timer = setTimeout(() => extendSessionFn(), 5000);

    return () => {
      clearTimeout(timer);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [session]);
}
