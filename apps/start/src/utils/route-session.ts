import type { AppRouter } from '@openpanel/core';
import type { QueryClient } from '@tanstack/react-query';
import type { TRPCOptionsProxy } from '@trpc/tanstack-react-query';

interface SessionRouteContext {
  queryClient: QueryClient;
  trpc: TRPCOptionsProxy<AppRouter>;
}

// Route guards read the session from the query cache rather than from the
// root route's context: while one navigation's root `beforeLoad` is in flight
// the router resets that context to its signed-out default, so a concurrent
// navigation's guard would redirect a signed-in user to /login.
export async function isSignedIn(
  context: SessionRouteContext
): Promise<boolean> {
  const session = await context.queryClient.ensureQueryData(
    context.trpc.auth.session.queryOptions()
  );
  return Boolean(session?.session);
}
