import type { Metadata } from 'next';
import {
  OPENPANEL_DESCRIPTION,
  OPENPANEL_SITE_NAME,
} from './openpanel-brand';
import { url as baseUrl } from './layout.shared';

const siteName = OPENPANEL_SITE_NAME;
const defaultDescription = OPENPANEL_DESCRIPTION;
const defaultImage = baseUrl('/ogimage.png');

export function getOgImageUrl(url: string): string {
  return `/og/${url.replace(baseUrl('/'), '/')}`;
}

export function getRootMetadata(): Metadata {
  return getRawMetadata({
    url: baseUrl('/'),
    title: `${siteName} | An open-source alternative to Mixpanel`,
    description: defaultDescription,
    image: defaultImage,
  });
}

export function getPageMetadata({
  url,
  title,
  description,
  image,
}: {
  url: string;
  title: string;
  description: string;
  image?: string;
}): Metadata {
  return getRawMetadata({
    url,
    title: `${title} | ${siteName}`,
    description,
    image: image ?? getOgImageUrl(url),
  });
}

export function getRawMetadata(
  {
    url,
    title,
    description,
    image,
  }: { url: string; title: string; description: string; image: string },
  meta: Metadata = {},
): Metadata {
  return {
    title,
    description,
    alternates: {
      canonical: baseUrl(url),
    },
    icons: {
      apple: '/apple-touch-icon.png',
      icon: '/favicon.ico',
    },
    manifest: '/site.webmanifest',
    openGraph: {
      title,
      description,
      siteName: siteName,
      url: baseUrl(url),
      type: 'website',
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
    ...meta,
  };
}
