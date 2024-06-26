import type { AppProps } from 'next/app';
import Head from 'next/head';
import Script from 'next/script';

import 'src/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <Component {...pageProps} />
      <Script
        src="https://openpanel.dev/op.js"
        async
        defer
        strategy="afterInteractive"
      />
      <Script
        id="openpanel"
        dangerouslySetInnerHTML={{
          __html: `
          window.op =
            window.op ||
            function (...args) {
              (window.op.q = window.op.q || []).push(args);
            };
          window.op('ctor', {
            clientId: 'bda63168-ca41-4eb2-b9a4-24e6bb6d9d1b',
            trackScreenViews: true,
            trackOutgoingLinks: true,
            trackAttributes: true,
          });
        `,
        }}
      />
    </>
  );
}
