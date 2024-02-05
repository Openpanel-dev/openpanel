import { Head, Html, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html>
      <Head>
        <script
          async
          src="/cdn.global.js"
          client-id="568b4ed1-5d00-4f27-88a7-b8959e6674bd"
          client-secret="1e362905-d352-44c4-9263-e037a2ad52fb"
          track-screen-views="true"
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
