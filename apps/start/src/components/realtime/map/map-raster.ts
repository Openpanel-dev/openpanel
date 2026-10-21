import type { ZoomTransform } from 'd3-zoom';
import {
  RASTER_DETAIL_MARGIN,
  RASTER_DETAIL_MAX_PIXELS,
  RASTER_FINE_DETAIL_ZOOM,
  RASTER_MAX_PIXEL_RATIO,
  RASTER_SETTLE_MS,
} from './map-constants';
import type { MapGeometry, NightRing, WorldBox } from './map-geometry';

export interface WorldStyle {
  ocean: string;
  land: string;
  border: string;
  night: string;
  nightAlpha: number;
}

interface Viewport {
  width: number;
  height: number;
  pixelRatio: number;
}

/** A crisp bitmap of the area around the viewport at one exact zoom. */
interface DetailBitmap {
  canvas: HTMLCanvasElement;
  k: number;
  /** Top-left of the bitmap in world coordinates (zoom 1). */
  left: number;
  top: number;
  /** World units covered. */
  width: number;
  height: number;
  pixelRatio: number;
}

/**
 * Keeps the drawn world in bitmaps so a pan or zoom frame is a blit, not a
 * fill of every coastline. A low-res copy of the whole world always exists;
 * a crisp one for the current view is rendered once the gesture settles.
 */
export class WorldRaster {
  private base: HTMLCanvasElement | null = null;
  private basePixelRatio = 1;
  private detail: DetailBitmap | null = null;
  /** Reused between renders; allocating a bitmap this size each time was most of the cost. */
  private detailCanvas: HTMLCanvasElement | null = null;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private geometry: MapGeometry,
    private night: NightRing[],
    private style: WorldStyle,
    private readonly onDetailReady: () => void
  ) {}

  update(geometry: MapGeometry, night: NightRing[], style: WorldStyle) {
    this.geometry = geometry;
    this.night = night;
    this.style = style;
    this.base = null;
    this.detail = null;
  }

  dispose() {
    if (this.settleTimer) {
      clearTimeout(this.settleTimer);
    }
  }

  draw(
    context: CanvasRenderingContext2D,
    transform: ZoomTransform,
    viewport: Viewport
  ) {
    const { pixelRatio } = viewport;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = this.style.ocean;
    context.fillRect(
      0,
      0,
      viewport.width * pixelRatio,
      viewport.height * pixelRatio
    );
    context.setTransform(
      pixelRatio * transform.k,
      0,
      0,
      pixelRatio * transform.k,
      pixelRatio * transform.x,
      pixelRatio * transform.y
    );

    const detailCovers = this.detailCovers(transform, viewport);
    if (!detailCovers) {
      const base = this.getBase();
      const { worldLeft, worldWidth, panBounds } = this.geometry;
      const panTop = panBounds[0][1];
      for (const offset of this.visibleCopies(transform, viewport)) {
        context.drawImage(
          base,
          worldLeft + offset,
          panTop,
          worldWidth,
          base.height / this.basePixelRatio
        );
      }
      this.scheduleDetail(transform, viewport);
    }

    if (this.detail && this.detail.k === transform.k) {
      const { canvas, left, top, width, height } = this.detail;
      context.drawImage(canvas, left, top, width, height);
    }
  }

  private detailCovers(transform: ZoomTransform, viewport: Viewport) {
    const detail = this.detail;
    if (!detail || detail.k !== transform.k) {
      return false;
    }
    const [[left, top], [right, bottom]] = this.visibleWorldBox(
      transform,
      viewport
    );
    return (
      left >= detail.left &&
      top >= detail.top &&
      right <= detail.left + detail.width &&
      bottom <= detail.top + detail.height
    );
  }

  private visibleWorldBox(
    transform: ZoomTransform,
    viewport: Viewport
  ): [[number, number], [number, number]] {
    return [
      [transform.invertX(0), transform.invertY(0)],
      [transform.invertX(viewport.width), transform.invertY(viewport.height)],
    ];
  }

  private visibleCopies(transform: ZoomTransform, viewport: Viewport) {
    const { worldLeft, worldWidth } = this.geometry;
    const [[left], [right]] = this.visibleWorldBox(transform, viewport);
    const first = Math.floor((left - worldLeft) / worldWidth);
    const last = Math.floor((right - worldLeft) / worldWidth);
    const offsets: number[] = [];
    for (let copy = first; copy <= last; copy++) {
      offsets.push(copy * worldWidth);
    }
    return offsets;
  }

  /** The whole world at zoom 1, at screen resolution; the fallback while moving. */
  private getBase() {
    if (this.base) {
      return this.base;
    }
    const { worldLeft, worldWidth, panBounds } = this.geometry;
    const panTop = panBounds[0][1];
    const worldHeight = panBounds[1][1] - panTop;
    const pixelRatio = 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(worldWidth * pixelRatio);
    canvas.height = Math.ceil(worldHeight * pixelRatio);
    const context = canvas.getContext('2d');
    if (context) {
      context.setTransform(
        pixelRatio,
        0,
        0,
        pixelRatio,
        -worldLeft * pixelRatio,
        -panTop * pixelRatio
      );
      this.drawWorld(context, 1, [0], null);
    }
    this.base = canvas;
    this.basePixelRatio = pixelRatio;
    return canvas;
  }

  private scheduleDetail(transform: ZoomTransform, viewport: Viewport) {
    if (this.settleTimer) {
      clearTimeout(this.settleTimer);
    }
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null;
      this.renderDetail(transform, viewport);
      this.onDetailReady();
    }, RASTER_SETTLE_MS);
  }

  private renderDetail(transform: ZoomTransform, viewport: Viewport) {
    const pixelRatio = Math.min(viewport.pixelRatio, RASTER_MAX_PIXEL_RATIO);
    const marginX = viewport.width * RASTER_DETAIL_MARGIN;
    const marginY = viewport.height * RASTER_DETAIL_MARGIN;
    let screenWidth = viewport.width + 2 * marginX;
    let screenHeight = viewport.height + 2 * marginY;
    const pixels = screenWidth * screenHeight * pixelRatio * pixelRatio;
    if (pixels > RASTER_DETAIL_MAX_PIXELS) {
      const shrink = Math.sqrt(RASTER_DETAIL_MAX_PIXELS / pixels);
      screenWidth *= shrink;
      screenHeight *= shrink;
    }
    const offsetX = (screenWidth - viewport.width) / 2;
    const offsetY = (screenHeight - viewport.height) / 2;
    const { k } = transform;
    const left = transform.invertX(-offsetX);
    const top = transform.invertY(-offsetY);

    const canvas = this.detailCanvas ?? document.createElement('canvas');
    this.detailCanvas = canvas;
    const width = Math.ceil(screenWidth * pixelRatio);
    const height = Math.ceil(screenHeight * pixelRatio);
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    } else {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, width, height);
    }
    context.setTransform(
      pixelRatio * k,
      0,
      0,
      pixelRatio * k,
      -left * pixelRatio * k,
      -top * pixelRatio * k
    );
    const copies = this.visibleCopies(transform, {
      ...viewport,
      width: screenWidth,
    });
    const area: WorldBox = [
      [left, top],
      [left + screenWidth / k, top + screenHeight / k],
    ];
    this.drawWorld(context, k, copies, area);

    this.detail = {
      canvas,
      k,
      left,
      top,
      width: screenWidth / k,
      height: screenHeight / k,
      pixelRatio,
    };
  }

  /** Fills the coarse world, or only the detailed countries inside `area` when zoomed in. */
  private drawWorld(
    context: CanvasRenderingContext2D,
    k: number,
    copies: number[],
    area: WorldBox | null
  ) {
    const { style, night, geometry } = this;
    const useFine = area !== null && k >= RASTER_FINE_DETAIL_ZOOM;
    const hairline = 1 / k;
    for (const offset of copies) {
      context.save();
      context.translate(offset, 0);
      const local: WorldBox | null = area && [
        [area[0][0] - offset, area[0][1]],
        [area[1][0] - offset, area[1][1]],
      ];

      context.fillStyle = style.land;
      if (useFine && local) {
        for (const country of geometry.fineCountries) {
          if (overlaps(country.bounds, local)) {
            context.fill(country.path);
          }
        }
      } else {
        context.fill(geometry.coarseLand);
      }

      context.strokeStyle = style.border;
      context.lineWidth = hairline;
      if (useFine && local) {
        for (const bucket of geometry.fineBorders) {
          if (overlaps(bucket.bounds, local)) {
            context.stroke(bucket.path);
          }
        }
      } else {
        context.stroke(geometry.coarseBorders);
      }

      // Night deepens ring by ring past the terminator.
      context.fillStyle = style.night;
      for (const ring of night) {
        context.globalAlpha = style.nightAlpha * ring.strength;
        context.fill(ring.path, 'evenodd');
      }
      context.globalAlpha = 1;
      context.restore();
    }
  }
}

function overlaps(a: WorldBox, b: WorldBox) {
  return (
    a[0][0] <= b[1][0] &&
    a[1][0] >= b[0][0] &&
    a[0][1] <= b[1][1] &&
    a[1][1] >= b[0][1]
  );
}
