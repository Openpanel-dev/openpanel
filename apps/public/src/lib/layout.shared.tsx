import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export const siteName = 'OpenPanel';
export const baseUrl =
  process.env.NODE_ENV === 'production'
    ? 'https://openpanel.dev'
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
      title: siteName,
    },
    links: [],
  };
}

export const authors = [
  {
    name: 'OpenPanel Team',
    url: 'https://openpanel.com',
  },
  {
    name: 'Carl-Gerhard Lindesvärd',
    url: 'https://openpanel.com',
    image: '/twitter-carl.jpg',
  },
];

export const getAuthor = (author?: string) => {
  return authors.find((a) => a.name === author)!;
};
