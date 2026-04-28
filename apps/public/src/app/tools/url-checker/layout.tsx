import { getPageMetadata } from '@/lib/metadata';
import type { Metadata } from 'next';

export const metadata: Metadata = getPageMetadata({
  url: '/tools/url-checker',
  title: 'Free SEO URL Checker — Open Graph, Meta Tags & Social Preview',
  description:
    "Inspect any URL's SEO, Open Graph, Twitter Cards, redirects, SSL, and tech stack. Free, instant, no signup. Built for developers and SEOs.",
});

export default function IPLookupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
