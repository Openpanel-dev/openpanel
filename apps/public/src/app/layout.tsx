import { cn } from '@/utils/cn';

import '@/styles/globals.css';

import type { Metadata } from 'next';
import Script from 'next/script';

import { defaultMeta } from './meta';

export const metadata: Metadata = {
  ...defaultMeta,
  alternates: {
    canonical: 'https://openpanel.dev',
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="light">
      <body className={cn('min-h-screen font-sans antialiased grainy')}>
        {children}
      </body>
      <Script
        src="/op.js"
        data-url="https://api.openpanel.dev"
        data-client-id="301c6dc1-424c-4bc3-9886-a8beab09b615"
        data-track-screen-views="1"
        data-track-outgoing-links="1"
      />
    </html>
  );
}
