import { OpenpanelProvider } from '@openpanel-test/nextjs';
import type { AppProps } from 'next/app';

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <OpenpanelProvider
        clientId="0acce97f-1126-4439-b7ee-5d384e2fc94b"
        url="http://localhost:3333"
        trackScreenViews
      />
      <Component {...pageProps} />
    </>
  );
}
