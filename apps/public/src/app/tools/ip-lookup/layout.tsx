import { getPageMetadata } from '@/lib/metadata';
import type { Metadata } from 'next';

export const metadata: Metadata = getPageMetadata({
  url: '/tools/ip-lookup',
  title: 'What Is My IP? Free IP Address Lookup & Geolocation',
  description:
    'Find your IP address and location instantly. See city, country, ISP, ASN, and coordinates. Free, no signup, no tracking. Works for any IPv4 or IPv6 address.',
});

export default function IPLookupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
