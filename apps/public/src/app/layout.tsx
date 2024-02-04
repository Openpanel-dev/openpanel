import { cn } from '@/utils/cn';

import '@/styles/globals.css';

import type { Metadata } from 'next';

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
    </html>
  );
}
