import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Openpanel.dev',
    short_name: 'Openpanel.dev',
    description: '',
    start_url: '/',
    display: 'standalone',
    background_color: '#fff',
    theme_color: '#fff',
    icons: [
      {
        src: 'https://openpanel.dev/favicon.ico',
        sizes: 'any',
        type: 'image/x-icon',
      },
    ],
  };
}
