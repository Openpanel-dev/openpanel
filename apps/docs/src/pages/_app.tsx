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
        src="https://openpanel.dev/op1.js"
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
            clientId: '301c6dc1-424c-4bc3-9886-a8beab09b615',
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
