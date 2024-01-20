import { cn } from '@/utils/cn';
import { Space_Grotesk } from 'next/font/google';

import Providers from './providers';

import '@/styles/globals.css';

import { getSession } from '@/server/auth';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import Auth from './auth';

// import { cookies } from 'next/headers';

const font = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--text',
});

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
  const session = await getSession();

  return (
    <html lang="en" className="light">
      <body
        className={cn(
          'min-h-screen font-sans antialiased grainy bg-slate-50',
          font.className
        )}
      >
        <Providers cookies={cookies().getAll()} session={session}>
          {session ? children : <Auth />}
        </Providers>
      </body>
    </html>
  );
}
