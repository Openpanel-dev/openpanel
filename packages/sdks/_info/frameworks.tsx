const api = {
  logo: 'https://cdn-icons-png.flaticon.com/512/10169/10169724.png',
  name: 'Rest API',
  href: 'https://docs.openpanel.dev/docs/api',
} as const;

export const frameworks = {
  website: [
    {
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/HTML5_logo_and_wordmark.svg/240px-HTML5_logo_and_wordmark.svg.png',
      name: 'HTML / Script',
      href: 'https://docs.openpanel.dev/docs/script',
    },
    {
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/React-icon.svg/2300px-React-icon.svg.png',
      name: 'React',
      href: 'https://docs.openpanel.dev/docs/react',
    },
    {
      logo: 'https://static-00.iconduck.com/assets.00/nextjs-icon-512x512-y563b8iq.png',
      name: 'Next.js',
      href: 'https://docs.openpanel.dev/docs/nextjs',
    },
    {
      logo: 'https://www.datocms-assets.com/205/1642515307-square-logo.svg',
      name: 'Remix',
      href: 'https://docs.openpanel.dev/docs/remix',
    },
    {
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Vue.js_Logo_2.svg/1024px-Vue.js_Logo_2.svg.png',
      name: 'Vue',
      href: 'https://docs.openpanel.dev/docs/vue',
    },
    {
      logo: 'https://astro.build/assets/press/astro-icon-dark.png',
      name: 'Astro',
      href: 'https://docs.openpanel.dev/docs/astro',
    },
    api,
  ],
  app: [
    {
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/React-icon.svg/2300px-React-icon.svg.png',
      name: 'React-Native',
      href: 'https://docs.openpanel.dev/docs/react-native',
    },
    api,
  ],
  backend: [
    {
      logo: 'https://static-00.iconduck.com/assets.00/node-js-icon-454x512-nztofx17.png',
      name: 'Node',
      href: 'https://docs.openpanel.dev/docs/node',
    },
    {
      logo: 'https://expressjs.com/images/favicon.png',
      name: 'Express',
      href: 'https://docs.openpanel.dev/docs/express',
    },
    {
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Laravel.svg/1969px-Laravel.svg.png',
      name: 'Laravel',
      href: 'https://github.com/tbleckert/openpanel-laravel/tree/main',
    },
    api,
  ],
} as const;
