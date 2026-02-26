import { RootProvider } from 'fumadocs-ui/provider/next';
import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { TooltipProvider } from '@/components/ui/tooltip';
import { getRootMetadata } from '@/lib/metadata';
import { cn } from '@/lib/utils';
import './global.css';
import { OpenPanelComponent } from '@openpanel/nextjs';

const font = Geist({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});
const mono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  userScalable: true,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafafa' },
    { media: '(prefers-color-scheme: dark)', color: '#171717' },
  ],
};

export const metadata: Metadata = getRootMetadata();

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html
      className={cn(font.className, mono.variable)}
      lang="en"
      suppressHydrationWarning
    >
      <body className="flex min-h-screen flex-col bg-background">
        <RootProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </RootProvider>
        {process.env.NEXT_PUBLIC_OP_CLIENT_ID && (
          <OpenPanelComponent
            clientId={process.env.NEXT_PUBLIC_OP_CLIENT_ID}
            sessionReplay={{
              enabled: true,
            }}
            trackAttributes
            trackOutgoingLinks
            trackScreenViews
          />
        )}
      </body>
    </html>
  );
}
