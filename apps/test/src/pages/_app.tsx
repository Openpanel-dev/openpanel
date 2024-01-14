import { useEffect } from 'react';
import { mixan } from '@/analytics';
import type { AppProps } from 'next/app';
import { useRouter } from 'next/router';

export default function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();
  useEffect(() => {
    mixan.screenView();
    return router.events.on('routeChangeComplete', () => {
      mixan.screenView();
    });
  }, []);
  return <Component {...pageProps} />;
}
