import { appRouter } from '@/server/api/root';
import { auth } from '@clerk/nextjs';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => {
      console.log('------- createContext --------');
      const session = auth();
      console.log('session', session);
      console.log('session', JSON.stringify(session, null, 2));

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
