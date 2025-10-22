import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/healthcheck')({
  server: {
    handlers: {
      GET: async () => {
        return new Response('OK');
      },
    },
  },
});
