import { getPageMetadata } from '@/lib/metadata';
import type { Metadata } from 'next';

export const metadata: Metadata = getPageMetadata({
  url: '/tools/ip-lookup',
  title: 'Free IP Address Lookup — Geolocation, ISP & ASN',
  description:
    'Instantly look up any IP address. Get country, city, region, ISP, ASN, and coordinates in seconds. Free tool, no signup required, powered by MaxMind GeoLite2.',
});

export default function IPLookupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
