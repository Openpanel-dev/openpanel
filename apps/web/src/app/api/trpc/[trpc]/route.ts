import { appRouter } from '@/server/api/root';
import { auth } from '@clerk/nextjs';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => {
      return {
        session: auth(),
      };
    },
  });

export { handler as GET, handler as POST };
