import { appRouter } from '@/server/api/root';
import { getAuth } from '@clerk/nextjs/server';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    async createContext({ req }) {
      const session = getAuth(req as any);
      return {
        session,
      };
    },
    onError(opts) {
      const { error, type, path, input, ctx, req } = opts;
      console.error('---- TRPC ERROR');
      console.error('Error:', error);
      console.error('Context:', ctx);
      console.error();
    },
  });

export { handler as GET, handler as POST };
