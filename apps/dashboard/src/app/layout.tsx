import { cn } from '@/utils/cn';
import NextTopLoader from 'nextjs-toploader';

import Providers from './providers';

import '@/styles/globals.css';
import 'flag-icons/css/flag-icons.min.css';
import 'katex/dist/katex.min.css';

import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';

export const metadata = {
  title: 'Overview - Openpanel.dev',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          'grainy min-h-screen bg-def-100 font-sans text-base antialiased leading-normal',
          GeistSans.variable,
          GeistMono.variable,
        )}
      >
        <NextTopLoader
          showSpinner={false}
          color="#2463EB"
          height={2}
          shadow={false}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
