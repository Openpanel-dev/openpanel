import { lazy, Suspense, useEffect, useState } from 'react';

/**
 * Client-only mount wrapper for the chat drawer.
 *
 * `@better-agent/client` uses Ajv for JSON schema validation which
 * compiles validators via `new Function()`. The Cloudflare Workers
 * SSR environment (workerd) disallows runtime code generation, so the
 * client module can't be evaluated during SSR.
 *
 * This slot:
 *  - Returns null on the server and during initial hydration (no
 *    mismatch: the server HTML has no drawer, the client's first
 *    render matches)
 *  - After `useEffect` fires on the client, triggers the lazy import
 *    which loads `@better-agent/client` for the first time
 *  - Suspense keeps the tree stable while the chunk loads
 *
 * The drawer is gated by `?chat=<id>` anyway, so it's never visible
 * on the first paint — there's no UX cost to this wrapping.
 */
const ChatDrawer = lazy(() =>
  import('./chat-drawer').then((m) => ({ default: m.ChatDrawer })),
);

export function ChatDrawerSlot() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return (
    <Suspense fallback={null}>
      <ChatDrawer />
    </Suspense>
  );
}
