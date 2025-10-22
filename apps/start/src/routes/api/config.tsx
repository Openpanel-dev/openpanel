import { Sidebar } from '@/components/sidebar';
import { getServerEnvs } from '@/server/get-envs';
import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';

// Nothing sensitive here, its client environment variables which is good for debugging
export const Route = createFileRoute('/api/config')({
  server: {
    handlers: {
      GET: async () => {
        const envs = await getServerEnvs();
        return new Response(JSON.stringify(envs), {
          headers: {
            'Content-Type': 'application/json',
          },
        });
      },
    },
  },
});
