import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { OPENPANEL_BASE_URL, OPENPANEL_NAME } from './openpanel-brand';
import { Logo } from '@/components/logo';

export const siteName = OPENPANEL_NAME;
export const baseUrl =
  process.env.NODE_ENV === 'production'
    ? OPENPANEL_BASE_URL
    : 'http://localhost:3000';
export const url = (path: string) => {
  if (path.startsWith('http')) {
    return path;
  }

  return `${baseUrl}${path}`;
};

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="row items-center gap-2">
          <Logo className="w-6" />
          <span className="font-semibold tracking-tight">{siteName}</span>
          <span className="rounded-full bg-neutral-900/5 px-2 py-0.5 font-medium text-neutral-600 text-xs">
            Docs
          </span>
        </span>
      ),
      url: '/docs',
    },
    links: [],
    themeSwitch: { enabled: false },
  };
}

export const authors = [
  {
    name: 'OpenPanel Team',
    url: 'https://openpanel.dev',
  },
  {
    name: 'Carl-Gerhard Lindesvärd',
    url: 'https://openpanel.dev',
    image: '/twitter-carl.jpg',
  },
];

export const getAuthor = (author?: string) => {
  return authors.find((a) => a.name === author)!;
};
