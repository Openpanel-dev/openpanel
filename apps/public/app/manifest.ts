import type { MetadataRoute } from 'next';

import { metadata } from './layout';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: metadata.title as string,
    short_name: 'Openpanel.dev',
    description: metadata.description!,
    start_url: '/',
    display: 'standalone',
    background_color: '#fff',
    theme_color: '#fff',
    icons: [
      {
        src: '/favicon.ico',
        sizes: 'any',
        type: 'image/x-icon',
      },
    ],
  };
}
