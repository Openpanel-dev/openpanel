import { appRouter } from '@/server/api/root';
import { getSession } from '@/server/auth';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: async () => {
      const session = await getSession();
      return {
        session,
      };
    },
  });

export { handler as GET, handler as POST };
