import type React from 'react';
import { AstroIcon } from './icons/astro-icon';
import { ExpressIcon } from './icons/express-icon';
import { HtmlIcon } from './icons/html-icon';
import { LaravelIcon } from './icons/laravel-icon';
import { NextjsIcon } from './icons/nextjs-icon';
import { NodeIcon } from './icons/node-icon';
import { ReactIcon } from './icons/react-icon';
import { RemixIcon } from './icons/remix-icon';
import { RestIcon } from './icons/rest-icon';
import { VueIcon } from './icons/vue-icon';

export type Framework = {
  key: string;
  IconComponent: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  name: string;
  href: string;
  type: ('website' | 'app' | 'backend')[];
};

export const frameworks: Framework[] = [
  {
    key: 'html',
    IconComponent: HtmlIcon,
    name: 'HTML / Script',
    href: 'https://openpanel.dev/docs/sdks/script',
    type: ['website'],
  },
  {
    key: 'react',
    IconComponent: ReactIcon,
    name: 'React',
    href: 'https://openpanel.dev/docs/sdks/react',
    type: ['website'],
  },
  {
    key: 'nextjs',
    IconComponent: NextjsIcon,
    name: 'Next.js',
    href: 'https://openpanel.dev/docs/sdks/nextjs',
    type: ['website'],
  },
  {
    key: 'remix',
    IconComponent: RemixIcon,
    name: 'Remix',
    href: 'https://openpanel.dev/docs/sdks/remix',
    type: ['website'],
  },
  {
    key: 'vue',
    IconComponent: VueIcon,
    name: 'Vue',
    href: 'https://openpanel.dev/docs/sdks/vue',
    type: ['website'],
  },
  {
    key: 'astro',
    IconComponent: AstroIcon,
    name: 'Astro',
    href: 'https://openpanel.dev/docs/sdks/astro',
    type: ['website'],
  },
  {
    key: 'rest',
    IconComponent: RestIcon,
    name: 'Rest API',
    href: 'https://openpanel.dev/docs/api/track',
    type: ['backend', 'app', 'website'],
  },
  {
    key: 'react-native',
    IconComponent: ReactIcon,
    name: 'React-Native',
    href: 'https://openpanel.dev/docs/sdks/react-native',
    type: ['app'],
  },
  {
    key: 'node',
    IconComponent: NodeIcon,
    name: 'Node',
    href: 'https://openpanel.dev/docs/sdks/javascript',
    type: ['backend'],
  },
  {
    key: 'express',
    IconComponent: ExpressIcon,
    name: 'Express',
    href: 'https://openpanel.dev/docs/sdks/express',
    type: ['backend'],
  },
  {
    key: 'laravel',
    IconComponent: LaravelIcon,
    name: 'Laravel',
    href: 'https://github.com/tbleckert/openpanel-laravel/tree/main',
    type: ['backend'],
  },
];
