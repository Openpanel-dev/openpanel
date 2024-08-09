import { cn } from '@/utils/cn';
import type { Metadata } from 'next';
import { Bricolage_Grotesque, Inter } from 'next/font/google';

import { OpenpanelProvider } from '@openpanel/nextjs';

import Footer from './footer';
import { defaultMeta } from './meta';

import '@/styles/globals.css';

import Script from 'next/script';

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
          'grainy min-h-screen font-sans text-slate-900 antialiased',
          head.variable,
          body.variable
        )}
      >
        <Navbar darkText />
        {children}
        <Footer />
      </body>

      <Script src={'https://openpanel.dev/op1.js'} async defer />
      <Script
        id="op1"
        dangerouslySetInnerHTML={{
          __html: `window.op = window.op || function(...args) {(window.op.q = window.op.q || []).push(args)};
          window.op('init', {"clientId":"301c6dc1-424c-4bc3-9886-a8beab09b615","sdk":"nextjs","sdkVersion":"1.0.0-beta","trackAttributes":true,"trackScreenViews":true,"trackOutgoingLinks":true});
          `,
        }}
      />
    </html>
  );
}
