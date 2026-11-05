import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const compactNumber = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export const formatEventsCount = (value: number) => compactNumber.format(value);

// Content slugs reach the filesystem and the page's JSON-LD straight from the
// URL, where Next has already decoded `%2F`; only plain file names get through.
const CONTENT_SLUG = /^[a-z0-9-]+$/;

export const isContentSlug = (slug: string) => CONTENT_SLUG.test(slug);
