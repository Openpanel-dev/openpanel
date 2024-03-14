import { cn } from '@/utils/cn';
import type { Metadata } from 'next';
import { Bricolage_Grotesque } from 'next/font/google';

import { OpenpanelProvider } from '@openpanel/nextjs';

import Footer from './footer';
import { defaultMeta } from './meta';

import '@/styles/globals.css';

export const metadata: Metadata = {
  ...defaultMeta,
  alternates: {
    canonical: 'https://openpanel.dev',
  },
};

const font = Bricolage_Grotesque({
  display: 'swap',
  subsets: ['latin'],
  weight: ['400', '700'],
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="light">
      <body
        className={cn(
          'min-h-screen antialiased grainy text-slate-600',
          font.className
        )}
      >
        {children}
        <Footer />
      </body>
      <OpenpanelProvider
        clientId="301c6dc1-424c-4bc3-9886-a8beab09b615"
        trackAttributes
        trackScreenViews
        trackOutgoingLinks
      />
    </html>
  );
}
