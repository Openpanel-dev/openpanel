/**
 * OpenPanel share embed host — auto-sizes iframes marked with
 * data-openpanel-embed and answers viewport queries so in-frame dialogs
 * can center on the visible slice (parent scroll ≠ iframe mid-point).
 *
 * Usage:
 *   <iframe data-openpanel-embed src="https://…/share/overview/…" …></iframe>
 *   <script async src="https://…/openpanel-embed.js"></script>
 */
(() => {
  const SOURCE = 'openpanel-embed';
  const SELECTOR = 'iframe[data-openpanel-embed]';

  function iframes() {
    return Array.from(document.querySelectorAll(SELECTOR));
  }

  function viewportFor(iframe) {
    const rect = iframe.getBoundingClientRect();
    const visibleTop = Math.min(rect.height, Math.max(0, -rect.top));
    const visibleBottom = Math.min(rect.height, window.innerHeight - rect.top);
    const visibleHeight = Math.max(0, visibleBottom - visibleTop);
    return { visibleTop, visibleHeight };
  }

  function replyViewport(iframe, source) {
    const { visibleTop, visibleHeight } = viewportFor(iframe);
    source.postMessage(
      { source: SOURCE, type: 'viewport', visibleTop, visibleHeight },
      '*',
    );
  }

  function onMessage(event) {
    const data = event.data;
    if (!data || data.source !== SOURCE) {
      return;
    }

    const iframe = iframes().find((el) => el.contentWindow === event.source);
    if (!iframe) {
      return;
    }

    if (data.type === 'resize' && typeof data.height === 'number') {
      const next = Math.max(0, Math.ceil(data.height));
      if (String(iframe.height) !== String(next)) {
        iframe.style.height = `${next}px`;
        iframe.setAttribute('height', String(next));
      }
      if (event.source) {
        event.source.postMessage(
          { source: SOURCE, type: 'resize-ack', height: next },
          '*',
        );
      }
      return;
    }

    if (data.type === 'request-viewport' && event.source) {
      replyViewport(iframe, event.source);
    }
  }

  function broadcastViewport() {
    for (const iframe of iframes()) {
      if (iframe.contentWindow) {
        replyViewport(iframe, iframe.contentWindow);
      }
    }
  }

  function pingIframes() {
    for (const iframe of iframes()) {
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage(
          { source: SOURCE, type: 'request-resize' },
          '*',
        );
      }
    }
  }

  window.addEventListener('message', onMessage);
  window.addEventListener('scroll', broadcastViewport, { passive: true });
  window.addEventListener('resize', broadcastViewport);

  function init() {
    for (const iframe of iframes()) {
      iframe.setAttribute('scrolling', 'no');
      if (!iframe.style.width) {
        iframe.style.width = '100%';
      }
      if (!iframe.style.border) {
        iframe.style.border = '0';
      }
      iframe.addEventListener('load', () => {
        if (iframe.contentWindow) {
          iframe.contentWindow.postMessage(
            { source: SOURCE, type: 'request-resize' },
            '*',
          );
        }
      });
    }
    pingIframes();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
