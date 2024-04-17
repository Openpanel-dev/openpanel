'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {}, [error]);

  return (
    <html lang="en">
      <body>
        <h1>Something went wrong</h1>
      </body>
    </html>
  );
}
