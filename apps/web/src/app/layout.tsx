import { cn } from '@/utils/cn';

import Providers from './providers';

import '@/styles/globals.css';

export const metadata = {};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="light">
      <body
        className={cn('min-h-screen font-sans antialiased grainy bg-slate-50')}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
