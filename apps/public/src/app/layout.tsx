import { cn } from '@/utils/cn';

import '@/styles/globals.css';

import type { Metadata } from 'next';
import { Bricolage_Grotesque } from 'next/font/google';
import Script from 'next/script';

import Footer from './footer';
import { defaultMeta } from './meta';

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
        <div
          className="w-full h-screen text-blue-950 bg-[radial-gradient(circle_at_2px_2px,#D9DEF6_2px,transparent_0)] absolute top-0 left-0 right-0 z-0"
          style={{
            backgroundSize: '70px 70px',
          }}
        />
        <div className="relative">{children}</div>
        <Footer />
      </body>
      <Script
        src="/op.js"
        data-url="https://api.openpanel.dev"
        data-client-id="301c6dc1-424c-4bc3-9886-a8beab09b615"
        data-track-screen-views="1"
        data-track-outgoing-links="1"
      />
      <Script
        defer
        data-domain="openpanel.dev"
        src="https://plausible.io/js/script.js"
      />
    </html>
  );
}
