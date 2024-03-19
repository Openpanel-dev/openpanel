import { cn } from '@/utils/cn';
import type { Metadata } from 'next';
import { Bricolage_Grotesque, Inter } from 'next/font/google';

import { OpenpanelProvider } from '@openpanel/nextjs';

import Footer from './footer';
import { defaultMeta } from './meta';

import '@/styles/globals.css';

import { Navbar } from './navbar';

export const metadata: Metadata = {
  ...defaultMeta,
  alternates: {
    canonical: 'https://openpanel.dev',
  },
};

const head = Bricolage_Grotesque({
  display: 'swap',
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-serif',
});
const body = Inter({
  display: 'swap',
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-sans',
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
          'min-h-screen antialiased grainy text-slate-900 font-sans',
          head.variable,
          body.variable
        )}
      >
        <Navbar darkText />
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
