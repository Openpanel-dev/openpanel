import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatEventsCount = (value: number) => {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(0)}K`;
  }
  return value.toString();
};

// Content slugs reach the filesystem and the page's JSON-LD straight from the
// URL, where Next has already decoded `%2F`; only plain file names get through.
const CONTENT_SLUG = /^[a-z0-9-]+$/;

export const isContentSlug = (slug: string) => CONTENT_SLUG.test(slug);
