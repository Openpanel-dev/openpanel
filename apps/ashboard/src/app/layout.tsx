import { cn } from '@/utils/cn';

import Providers from './providers';

import '@/styles/globals.css';
import '/node_modules/flag-icons/css/flag-icons.min.css';

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
    <html lang="en" className="light">
      <body
        className={cn('min-h-screen font-sans antialiased grainy bg-slate-100')}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
