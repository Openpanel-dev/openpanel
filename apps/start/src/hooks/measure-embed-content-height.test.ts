import { afterEach, describe, expect, it, vi } from 'vitest';
import { measureEmbedContentHeight } from './use-embed-viewport';

describe('measureEmbedContentHeight', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns 0 without reading HTMLElement when document is undefined', () => {
    vi.stubGlobal('document', undefined);
    vi.stubGlobal('HTMLElement', undefined);

    expect(measureEmbedContentHeight()).toBe(0);
  });
});
