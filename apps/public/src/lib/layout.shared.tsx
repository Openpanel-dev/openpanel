import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { defaultLocale, type AppLocale } from '@/i18n/routing';
import { FumadocsThemeControls } from '@/components/fumadocs-theme-controls';
import { OPENPANEL_BASE_URL, OPENPANEL_NAME } from './openpanel-brand';

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

export function baseOptions(locale: AppLocale = defaultLocale): BaseLayoutProps {
  return {
    i18n: false,
    nav: {
      title: siteName,
    },
    slots: {
      themeSwitch: FumadocsThemeControls,
    },
    links: [],
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
