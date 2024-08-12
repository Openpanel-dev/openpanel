import { cn } from '@/utils/cn';
import NextTopLoader from 'nextjs-toploader';

import Providers from './providers';

import '@/styles/globals.css';
import '/node_modules/flag-icons/css/flag-icons.min.css';

import { Inter } from 'next/font/google';

export const metadata = {
  title: 'Overview - Openpanel.dev',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: 1,
};

const body = Inter({
  display: 'swap',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          'grainy min-h-screen bg-def-100 font-sans text-base antialiased',
          body.variable
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
