import { Head, Html, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html>
      <Head>
        <script
          async
          src="/op.js"
          data-url="http://localhost:3333"
          data-client-id="0acce97f-1126-4439-b7ee-5d384e2fc94b"
          data-track-screen-views="1"
          data-track-outgoing-links="1"
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
