import { getPageMetadata } from '@/lib/metadata';
import type { Metadata } from 'next';

export const metadata: Metadata = getPageMetadata({
  url: '/tools/url-checker',
  title: 'URL Checker - Free Website & SEO Analysis Tool',
  description:
    'Analyze any website for SEO, social media, technical, and security information. Check meta tags, Open Graph, redirects, SSL certificates, and more.',
});

export default function IPLookupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
