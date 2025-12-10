import { getPageMetadata } from '@/lib/metadata';
import type { Metadata } from 'next';

export const metadata: Metadata = getPageMetadata({
  url: '/tools/ip-lookup',
  title: 'IP Lookup - Free IP Address Geolocation Tool',
  description:
    'Find your IP address and get detailed geolocation information including country, city, ISP, ASN, and coordinates. Free IP lookup tool with map preview.',
});

export default function IPLookupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
