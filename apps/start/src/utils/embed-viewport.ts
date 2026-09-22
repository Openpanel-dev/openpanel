/**
 * Pure helpers for OpenPanel share embeds (no DOM).
 * Parent page scrolls a tall iframe; dialogs must center in the *visible* slice.
 */

export type EmbedViewport = {
  /** Distance from the top of the iframe document to the top of the visible slice */
  visibleTop: number;
  /** Height of the visible slice inside the iframe (px) */
  visibleHeight: number;
};

export function isInIframe(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    return window.self !== window.top;
  } catch {
    // Cross-origin parent access can throw; being framed still means embedded.
    return true;
  }
}

/** Center Y (iframe document coords) for a dialog in the visible slice. */
export function embeddedDialogCenterY(viewport: EmbedViewport): number {
  return viewport.visibleTop + viewport.visibleHeight / 2;
}

/**
 * Map the iframe element's getBoundingClientRect() + parent viewport
 * into the visible slice inside the iframe document.
 */
export function viewportFromIframeRect(
  rect: { top: number; bottom: number; height: number },
  parentInnerHeight: number,
): EmbedViewport {
  const visibleTop = Math.min(rect.height, Math.max(0, -rect.top));
  const visibleBottom = Math.min(rect.height, parentInnerHeight - rect.top);
  const visibleHeight = Math.max(0, visibleBottom - visibleTop);
  return {
    visibleTop,
    visibleHeight,
  };
}
