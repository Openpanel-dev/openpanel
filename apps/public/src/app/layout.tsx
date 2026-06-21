import { RootProvider } from 'fumadocs-ui/provider/next';
import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { getTranslations } from 'next-intl/server';
import { TooltipProvider } from '@/components/ui/tooltip';
import { getAppLocale } from '@/i18n/server';
import { getRawMetadata } from '@/lib/metadata';
import { getHtmlLang } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { url } from '@/lib/layout.shared';
import './global.css';
import { OpenPanelComponent } from '@openpanel/nextjs';
import { ScrollTracker } from '@/components/scroll-tracker';

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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages');

  return getRawMetadata({
    url: url('/'),
    title: t('root_metadata_title'),
    description: t('root_metadata_description'),
    image: url('/ogimage.png'),
  });
}

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getAppLocale();

  return (
    <html
      className={cn(font.className, mono.variable)}
      lang={getHtmlLang(locale)}
      suppressHydrationWarning
    >
      <body className="flex min-h-screen flex-col bg-background">
        <RootProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </RootProvider>
        <ScrollTracker />
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
