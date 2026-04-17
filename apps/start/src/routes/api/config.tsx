import { createFileRoute } from '@tanstack/react-router';
import { getServerEnvs } from '@/server/get-envs';

export interface ConfigResonse {
  apiUrl: string;
  dashboardUrl: string;
  isSelfHosted: boolean;
  isMaintenance: boolean;
  isDemo: boolean;
}
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
