import { Head, Html, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html>
      <Head>
        <script
          async
          src="/op.js"
          data-url="https://api.openpanel.dev"
          data-client-id="301c6dc1-424c-4bc3-9886-a8beab09b615"
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
