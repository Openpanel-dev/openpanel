import type { MetadataRoute } from 'next';

export const dynamic = 'static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: process.env.NEXT_PUBLIC_DASHBOARD_URL,
    name: 'Openpanel.dev',
    short_name: 'Openpanel.dev',
    description: '',
    start_url: '/',
    display: 'standalone',
    background_color: '#fff',
    theme_color: '#fff',
  };
}
