import { RootProvider } from 'fumadocs-ui/provider';
import type { ReactNode } from 'react';
import './global.css';

import { TooltipProvider } from '@/components/ui/tooltip';
import { OpenPanelComponent } from '@openpanel/nextjs';
import { cn } from 'fumadocs-ui/components/api';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import type { Metadata, Viewport } from 'next';
import { url, baseUrl, siteName } from './layout.config';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  userScalable: true,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafafa' },
    { media: '(prefers-color-scheme: dark)', color: '#171717' },
  ],
};

const description = `${siteName} is a simple, affordable open-source alternative to Mixpanel for web and product analytics. Get powerful insights without the complexity.`;

export const metadata: Metadata = {
  title: {
    default: siteName,
    template: `%s | ${siteName}`,
  },
  description,
  alternates: {
    canonical: baseUrl,
  },
  icons: {
    apple: '/apple-touch-icon.png',
    icon: '/favicon.ico',
  },
  manifest: '/site.webmanifest',
  openGraph: {
    title: siteName,
    description,
    siteName: siteName,
    url: baseUrl,
    type: 'website',
    images: [
      {
        url: url('/ogimage.jpg'),
        width: 1200,
        height: 630,
        alt: siteName,
      },
    ],
  },
};

export default async function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={cn(GeistSans.variable, GeistMono.variable)}>
        <RootProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </RootProvider>
        <OpenPanelComponent
          clientId="301c6dc1-424c-4bc3-9886-a8beab09b615"
          trackAttributes
          trackScreenViews
          trackOutgoingLinks
        />
      </body>
    </html>
  );
}
