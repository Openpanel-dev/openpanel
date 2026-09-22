import { describe, expect, it } from 'vitest';
import {
  embeddedDialogCenterY,
  viewportFromIframeRect,
} from './embed-viewport';

describe('viewportFromIframeRect', () => {
  it('when the iframe top is above the parent viewport, visibleTop tracks scroll into the iframe', () => {
    // Parent scrolled so iframe top is 400px above the viewport; parent is 800 tall.
    expect(
      viewportFromIframeRect({ top: -400, bottom: 1600, height: 2000 }, 800),
    ).toEqual({ visibleTop: 400, visibleHeight: 800 });
  });

  it('when the iframe sits fully in view, visibleTop is 0', () => {
    expect(
      viewportFromIframeRect({ top: 100, bottom: 900, height: 800 }, 1000),
    ).toEqual({ visibleTop: 0, visibleHeight: 800 });
  });

  it('returns zero height when the iframe is fully above the parent viewport', () => {
    expect(
      viewportFromIframeRect({ top: -2000, bottom: -200, height: 1800 }, 800),
    ).toEqual({ visibleTop: 1800, visibleHeight: 0 });
  });

  it('returns zero height when the iframe is fully below the parent viewport', () => {
    expect(
      viewportFromIframeRect({ top: 1200, bottom: 2200, height: 1000 }, 800),
    ).toEqual({ visibleTop: 0, visibleHeight: 0 });
  });
});

describe('embeddedDialogCenterY', () => {
  it('centers the dialog in the visible slice', () => {
    expect(
      embeddedDialogCenterY({ visibleTop: 400, visibleHeight: 800 }),
    ).toBe(800);
  });
});
