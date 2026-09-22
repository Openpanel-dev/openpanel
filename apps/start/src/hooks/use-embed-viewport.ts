'use client';

import { useEffect, useState } from 'react';
import {
  type EmbedViewport,
  isInIframe,
  viewportFromIframeRect,
} from '@/utils/embed-viewport';

const SOURCE = 'openpanel-embed';

type ViewportMessage = {
  source: typeof SOURCE;
  type: 'viewport';
  visibleTop: number;
  visibleHeight: number;
};

type ResizeAckMessage = {
  source: typeof SOURCE;
  type: 'resize-ack';
  height: number;
};

function isViewportMessage(data: unknown): data is ViewportMessage {
  if (!data || typeof data !== 'object') {
    return false;
  }
  const msg = data as Record<string, unknown>;
  return (
    msg.source === SOURCE &&
    msg.type === 'viewport' &&
    typeof msg.visibleTop === 'number' &&
    typeof msg.visibleHeight === 'number'
  );
}

function isResizeAckMessage(data: unknown): data is ResizeAckMessage {
  if (!data || typeof data !== 'object') {
    return false;
  }
  const msg = data as Record<string, unknown>;
  return (
    msg.source === SOURCE &&
    msg.type === 'resize-ack' &&
    typeof msg.height === 'number'
  );
}

/**
 * Height of the share content itself — not documentElement.scrollHeight, which
 * floors at the iframe viewport and can never shrink after the host expands.
 */
export function measureEmbedContentHeight(
  root: Element | null | undefined = typeof document === 'undefined'
    ? null
    : document.querySelector('[data-openpanel-embed-root]'),
): number {
  // Guard before `instanceof HTMLElement` — that global is missing without a DOM.
  if (typeof document === 'undefined') {
    return 0;
  }
  if (root instanceof HTMLElement) {
    return Math.ceil(root.getBoundingClientRect().height);
  }
  const body = document.body;
  if (!body) {
    return 0;
  }
  let maxBottom = 0;
  for (const child of Array.from(body.children)) {
    if (!(child instanceof HTMLElement)) {
      continue;
    }
    const rect = child.getBoundingClientRect();
    maxBottom = Math.max(maxBottom, rect.bottom);
  }
  return Math.ceil(Math.max(0, maxBottom - body.getBoundingClientRect().top));
}

/**
 * While framed by openpanel-embed.js, keep the visible slice in sync so
 * overlays can pin to what the user actually sees (not mid-document).
 */
export function useEmbedViewport(): EmbedViewport | null {
  const [viewport, setViewport] = useState<EmbedViewport | null>(null);

  useEffect(() => {
    if (!isInIframe()) {
      return;
    }

    const onMessage = (event: MessageEvent) => {
      if (!isViewportMessage(event.data)) {
        return;
      }
      setViewport({
        visibleTop: event.data.visibleTop,
        visibleHeight: event.data.visibleHeight,
      });
    };

    window.addEventListener('message', onMessage);
    window.parent.postMessage({ source: SOURCE, type: 'request-viewport' }, '*');

    const interval = window.setInterval(() => {
      window.parent.postMessage(
        { source: SOURCE, type: 'request-viewport' },
        '*',
      );
    }, 250);

    return () => {
      window.removeEventListener('message', onMessage);
      window.clearInterval(interval);
    };
  }, []);

  return viewport;
}

/** Report content height to the parent embed host until acknowledged. */
export function useReportEmbedHeight(enabled = true) {
  useEffect(() => {
    if (!enabled || !isInIframe()) {
      return;
    }

    let acked = false;
    let lastHeight = -1;
    let retries = 0;
    let retryTimer: number | undefined;

    const publish = () => {
      const height = measureEmbedContentHeight();
      lastHeight = height;
      window.parent.postMessage(
        { source: SOURCE, type: 'resize', height },
        '*',
      );
    };

    const scheduleRetry = () => {
      if (acked || retries >= 20) {
        return;
      }
      retries += 1;
      retryTimer = window.setTimeout(() => {
        publish();
        scheduleRetry();
      }, 200);
    };

    const onMessage = (event: MessageEvent) => {
      if (!isResizeAckMessage(event.data)) {
        return;
      }
      if (event.data.height === lastHeight) {
        acked = true;
        if (retryTimer !== undefined) {
          window.clearTimeout(retryTimer);
        }
      }
    };

    const onHostPing = (event: MessageEvent) => {
      const data = event.data;
      if (
        data &&
        typeof data === 'object' &&
        (data as { source?: string; type?: string }).source === SOURCE &&
        (data as { type?: string }).type === 'request-resize'
      ) {
        publish();
      }
    };

    window.addEventListener('message', onMessage);
    window.addEventListener('message', onHostPing);
    publish();
    scheduleRetry();

    const root = document.querySelector('[data-openpanel-embed-root]');
    const ro = new ResizeObserver(() => {
      acked = false;
      retries = 0;
      publish();
      scheduleRetry();
    });
    if (root) {
      ro.observe(root);
    } else if (document.body) {
      ro.observe(document.body);
    }
    window.addEventListener('load', publish);

    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('message', onHostPing);
      window.removeEventListener('load', publish);
      if (retryTimer !== undefined) {
        window.clearTimeout(retryTimer);
      }
      ro.disconnect();
    };
  }, [enabled]);
}

export { isInIframe, viewportFromIframeRect };
