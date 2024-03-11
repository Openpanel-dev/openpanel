import type { MetadataRoute } from 'next';

import { defaultMeta } from './meta';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: defaultMeta.title as string,
    short_name: 'Openpanel.dev',
    description: defaultMeta.description!,
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
