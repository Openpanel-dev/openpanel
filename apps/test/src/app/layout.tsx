import { OpenpanelProvider } from '@mixan-test/nextjs';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body>
        <OpenpanelProvider
          clientId="0acce97f-1126-4439-b7ee-5d384e2fc94b"
          url="http://localhost:3333"
          trackScreenViews
          trackAttributes
          trackOutgoingLinks
        />
        {children}
      </body>
    </html>
  );
}
