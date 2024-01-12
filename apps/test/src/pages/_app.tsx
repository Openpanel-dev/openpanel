import { useEffect } from 'react';
import { mixan } from '@/analytics';
import type { AppProps } from 'next/app';
import { useRouter } from 'next/router';

mixan.init();

export default function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();
  useEffect(() => {
    return router.events.on('routeChangeComplete', () => {
      mixan.screenView();
    });
  }, []);
  return <Component {...pageProps} />;
}
