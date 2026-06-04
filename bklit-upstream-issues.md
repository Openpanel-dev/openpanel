# bklit-ui — Upstream Issues to File

Ready-to-post GitHub issues for `bklit-ui`. Each block below has a title and a body; copy/paste into the repo.

Local notes / source: `bklit-issues.md`.
Already filed upstream and excluded from this list: items #14 (= bklit #64) and #15 (= bklit #65).

---

## Issue 1

**Title:** `require("react-dom")` in chart components breaks under Vite / pure-ESM bundlers

**Body:**

Six chart components use a runtime `require` to lazily resolve `createPortal`:

```ts
// Dynamic import to avoid SSR issues
const { createPortal } = require("react-dom") as typeof import("react-dom");
```

Under Next.js this works because Next polyfills CommonJS in client chunks. Under Vite / TanStack Start / any pure-ESM client bundler, `require` is not defined at runtime and the chart blows up:

```
ReferenceError: require is not defined
    at ChartTooltip (chart-tooltip.tsx:146:28)
```

The chart then renders blank.

The lazy resolution isn't actually needed — every call site is already guarded by a `mounted` state that flips `true` only inside `useEffect`, so `createPortal` only runs on the client anyway.

**Affected files** (`packages/ui/src/charts/`)

- `tooltip/chart-tooltip.tsx`
- `tooltip/tooltip-box.tsx`
- `x-axis.tsx`
- `y-axis.tsx`
- `bar-x-axis.tsx`
- `bar-y-axis.tsx`

**Suggested fix**

Replace the lazy `require` with a top-level static import:

```ts
import { createPortal } from "react-dom";
```

…and delete the inline `const { createPortal } = require(...)` line just before each `createPortal(...)` call. The existing `mounted && container` guard above the call site already prevents SSR execution.

---

## Issue 2

**Title:** Registry (`apps/web/public/r/*.json`) lags `packages/ui/src/charts/` source

The shadcn registry build under `apps/web/public/r/*.json` is missing newer features that exist in `packages/ui/src/charts/`. Examples observed:

- `dashFromIndex` prop on `<Line>` / `<Area>`
- `<SeriesMarkers>`
- `<SeriesDashTailOverlay>`
- `path-stroke-utils.ts`
- `dash-tail-stroke.tsx`
- `series-point-marker.tsx`
- `area-gradient-defs.tsx`
- `use-line-segment-highlight.ts`
- `use-area-segment-highlight.ts`
- newer revisions of `area.tsx`, `line.tsx`

Because the registry is the source of truth for `shadcn add`, consumers running `shadcn add line-chart` (or similar) get the older code and either silently miss features or fail to compile when other registry items reference symbols that aren't there.

**Suggested fix**

Rebuild the registry after merges so it tracks `packages/ui/src/charts/`, ideally via CI on push to main.

---

## Issue 3

**Title:** `chart-context` registry item overwrites consumer chart palette in `.dark`

When `shadcn add chart-context` (or any item that depends on it) is run, it appends bklit's grayscale `--chart-1` … `--chart-5` overrides into the `.dark { ... }` block of the consumer's `styles.css`.

Two problems:

1. The injection collapses onto a single line, mangling the `.dark` block formatting.
2. Apps that already define their own `--chart-*` palette in `:root` (theme-agnostic) get those tokens silently overridden inside `.dark`. The result is that `bg-chart-1`, `text-chart-2`, etc. turn gray in dark mode across the entire app, including pages and components that have nothing to do with bklit charts.

In our case the conflicting tokens were:

- `--chart-1` … `--chart-5`
- `--chart-background`, `--chart-foreground`, `--chart-grid`, `--chart-crosshair`
- `--chart-marker-*`
- `--chart-ring-background`
- `--chart-label`
- `--chart-foreground-muted`

The only tokens that genuinely need to be theme-aware are the tooltip ones:

```css
--chart-tooltip-background: oklch(from var(--foreground) l c h / 0.92);
--chart-tooltip-foreground: var(--background);
--chart-tooltip-muted: oklch(from var(--background) l c h / 0.6);
```

**Suggested fixes (any of)**

- Namespace bklit's chart tokens (e.g. `--bk-chart-1`) so they can't collide with a consumer's `--chart-*` scale.
- Only emit the tooltip vars into `.dark` and keep the palette in `:root` only.
- Preserve formatting in the `.dark` block when appending (don't collapse to one line).

---

## Issue 4

**Title:** No dual Y-axis support in `<ComposedChart>` / cartesian shells

`ComposedChart` (and every other cartesian shell) computes a single linear Y scale from `max(all series values)`. There's no `yAxisId` / `orientation="right"` equivalent — you can't mount a second axis with an independent domain.

This is a regression vs. recharts and blocks a common analytics chart: showing a small-magnitude metric (e.g. unique visitors, 0–1,000) alongside a high-magnitude metric (e.g. revenue in cents, 0–5,000,000) on the same time series.

Current workarounds all have downsides:

- Pre-scaling the second series into the primary series' domain (lossy, requires reformatting in tooltip).
- Two stacked charts sharing the X domain (vertical real estate cost, complex sync).
- Rendering the second metric in a separate widget (loses correlation context).

**Suggested fix**

Add an optional `yScaleRight` (or `axes={[{ id: 'left', ... }, { id: 'right', ... }]}`) to `composed-chart.tsx` / `time-series-chart-shell.tsx`, plus a `yAxisId` prop on `<Line>` / `<Area>` / `<Bar>` to pick which scale they map against. Tooltip would need to read the right scale for series bound to it.

Non-trivial but high-value for analytics workloads.

---

## Issue 5

**Title:** `<XAxis>` default `tickMode="domain"` misaligns labels with data points

`<XAxis>` defaults to `tickMode="domain"`, which places `numTicks` (default 5) evenly across the time domain. Those positions are computed from `xScale.domain()`, not from real data points — so labels almost never coincide with an actual tick on the chart.

For sparse or non-uniform data (monthly bars, irregular event days, weekly aggregates), this looks visually off: a label sitting between two bars, or in the middle of a gap with no datum nearby.

`tickMode="data"` (one label per data row at the row's x position) is almost always the right behavior — it matches recharts and most analytics conventions.

**Suggested fix**

Either flip the default to `"data"`, or document `tickMode` prominently so consumers know to set it explicitly. The current default is a footgun for time-series charts with non-uniform data.

---

## Issue 6

**Title:** `<ChartMarkers>` get clipped by the chart `<svg>` element

`MarkerGroup` renders as SVG (`<g transform="translate(x, y)">`) inside the chart's own `<svg>`, not as an HTML portal. With marker `y=-8` and `size=24`, the top edge sits at SVG y = `margin.top - 20`. Anything less than `margin.top: 20` clips the marker.

Bumping `margin.top` works but introduces dead headroom on charts that don't have references on every render.

**Suggested fix**

Render the chart `<svg>` with `style={{ overflow: 'visible' }}` in both `time-series-chart-shell.tsx` and `bar-chart.tsx`. With that, markers can render above the chart's bounding box without clipping regardless of `margin.top`:

```tsx
<svg aria-hidden="true" height={height} width={width} style={{ overflow: 'visible' }}>
```

Verified locally — no observed downside (the parent container still clips so it doesn't bleed across the page).

---

## Issue 7

**Title:** `useActiveMarkers` matches references by day, not by hover bucket

`useActiveMarkers(markers)` matches `marker.date.toDateString()` against the active tooltip date. That's day-granular: on an hourly chart, every hour of the marker's day shows the reference in the tooltip even though the visual marker only sits on one hour. The tooltip and the chart disagree.

Repro: render an hourly time series with a marker at `2026-05-20T14:00:00Z`. Hover at `2026-05-20T03:00:00Z`. The reference still appears in the tooltip even though no marker is visible there.

**Suggested fix**

Match by bucket index instead of date string: snap each marker to its nearest data index and compare against the currently hovered point's index. This works for hourly / minute / arbitrary intervals.

Alternatively, accept the comparator as an option so consumers can opt into bucket-level matching.

Related: it would be nice for `<ChartTooltip>` to accept a `markers`/`references` prop and handle the matching itself, instead of consumers having to compose `useActiveMarkers` + `MarkerTooltipContent` manually.

---

## Issue 8

**Title:** `<Line>` and `<Area>` plot missing values at SVG y=0 (top of chart)

`getY` in both `line.tsx` and `area.tsx`:

```ts
return typeof value === "number" ? (yScale(value) ?? 0) : 0;
```

The fallback `0` is a raw SVG y coordinate, not a data-domain zero. In SVG, y=0 is the **top** of the chart, not the baseline — so a series with sparse data renders the missing rows at the ceiling, producing a flat line plastered to the top of the chart.

**Repro**

Render `<Line>` over an array where some rows are missing the line's `dataKey`. Hover at a missing row — the tooltip shows `0` but the hover dot is pinned to Y=max instead of Y=0.

**Suggested fix**

Fall back to `yScale(0)` (data-domain zero in pixel space) instead of raw SVG `0`:

```ts
const getY = useCallback((d) => {
  const value = d[dataKey];
  if (typeof value === "number") {
    return yScale(value) ?? yScale(0) ?? 0;
  }
  return yScale(0) ?? 0;
}, [dataKey, yScale]);
```

This places missing points on the baseline, matching recharts and visual expectations.

Alternative: emit `null` and have the path generator skip undefined points (true gaps). That's a bigger change but arguably more correct.

---

## Issue 9

**Title:** Hover spring constants feel sluggish on dense time series

Hover-related springs (`tooltip-box`, `tooltip-dot`, `tooltip-indicator`, line/area highlight) ship with constants around `{ stiffness: 100–300, damping: 20–30 }`. On dense time series with many data points, this reads as visible lag between the cursor and the indicator — by the time the tooltip catches up, the user is already two buckets past.

Locally we re-tuned to `{ stiffness: 1000, damping: 60 }` across:

- `tooltip/tooltip-box.tsx` (`springConfig`)
- `tooltip/tooltip-dot.tsx` (`crosshairSpringConfig`)
- `tooltip/tooltip-indicator.tsx` (`crosshairSpringConfig`)
- `line.tsx` (highlight `springConfig`)
- `area.tsx` (highlight `springConfig`)

Hover now feels precise and the indicator visibly leads to the next bucket on the same frame the user crosses the boundary.

**Suggested fix**

Either raise the defaults, or expose the spring config on the relevant components / via theme so consumers can tune without forking.

---

## Issue 10 (combined performance pass)

**Title:** Chart hover hot-path: multiple per-pixel re-render and DOM-measurement issues

While profiling hover on dense time-series charts (~200 points, 2 series), we found a stack of issues that compound — together they cause the entire chart subtree to re-render hundreds of times per second during continuous mouse motion, with each render doing 30–100ms of binary-search DOM measurement. Filing them together since they touch the same hot path.

Each item below is independent and can be fixed in isolation, but the cumulative effect is what makes hover feel laggy in production.

### 10a. `setTooltipData` fires on every mousemove pixel, not on bucket change

`use-chart-interaction.ts` → `handleMouseMove` calls `setTooltipData(resolveTooltipFromX(chartX))` on every `mousemove`. But `resolveTooltipFromX` snaps to the nearest data bucket — it returns an identical `{ point, index, x, yPositions }` for every pixel inside the same bucket. React still proceeds with the update because the new object reference !== the old, so every pixel of mouse motion triggers a full chart re-render for no behavioral reason.

**Fix:** wrap `setTooltipData` with a `commitTooltip(next)` helper that tracks the last committed `index` in a ref and bails out when `next.index === lastTooltipIndexRef.current`. Reset to `-1` on tooltip clear so the next entry commits fresh. Route every internal call site through `commitTooltip` (mousemove, mouseleave, mousedown, touchstart, touchmove, touchend). Keep the exported `setTooltipData` for external consumers.

State updates drop from ~hundreds/sec → ~tens/sec.

### 10b. `useLineSegmentHighlight` does 30–60 DOM measurements per hover per series

The shared `use-line-segment-highlight.ts` hook computes the highlight overlay bounds by calling `findPathLengthAtX(targetX)` twice (startX, endX) per render. That function runs a binary search calling `path.getPointAtLength()` per iteration (~10–20 DOM calls per search, each ~1–3ms). With 2 series and per-bucket hover re-renders, this dominates hover cost — 30–100ms per Line/Area per render.

Bklit #54 (closed) fixed this in `area.tsx`'s old inline `findLengthAtX` callback by switching to chord-length approximation — but the shared hook was never updated, and `line.tsx` continued calling the slow path through the hook.

**Fix:** rewrite the hook to pre-compute cumulative chord lengths between data points in pixel space (pure arithmetic), then scale them by `pathLength / totalChordLength` so the dasharray still aligns with the real curved SVG path. Memoize the chord pass on `(data, scales, dataKey)` so it runs once on data change, never on hover. Remove the `pathRef` parameter; add `yScale` and `dataKey`.

### 10c. `line.tsx` uses `useEffect` to set highlight springs (double-render cycle)

Every hover bucket boundary triggers two render cycles per `<Line>`:

```ts
useEffect(() => {
  offsetSpring.set(-segmentBounds.startLength);
  segmentLengthSpring.set(segmentBounds.segmentLength);
}, [segmentBounds.startLength, segmentBounds.segmentLength, ...]);
```

The effect fires after paint, calling `spring.set()` which schedules its own frame — but the effect itself ran inside a React commit, so React's reconciler does a second render to settle. Motion's `useSpring` is designed to be set imperatively in render.

Bklit #54 (closed) fixed this across `area.tsx`, `tooltip-dot.tsx`, `tooltip-indicator.tsx`, `tooltip/chart-tooltip.tsx`, `date-ticker.tsx`, `tooltip-box.tsx` — but missed `line.tsx`.

**Fix:** inline the spring calls in the render body:

```ts
const offsetSpring = useSpring(0, springConfig);
const segmentLengthSpring = useSpring(0, springConfig);
offsetSpring.set(-segmentBounds.startLength);
segmentLengthSpring.set(segmentBounds.segmentLength);
```

### 10d. `SeriesDashTailOverlay` re-runs `findPathLengthAtX` on every Area re-render

`SeriesDashTailOverlay` calls `findPathLengthAtX(pathRef.current, pathLength, dashStartX)` in its render body. Its props (data, pathLength, scales, dashFromIndex) are all stable on hover, but the component re-renders every time Area re-renders, re-running the ~30–60 DOM-call binary search for no reason. Profiler shows it at ~72ms self-time per hover bucket on dense series.

**Fix:** wrap the component in `React.memo`. With stable props, shallow comparison lets Area's per-bucket re-render skip the entire subtree. The binary search then runs only on actual geometry changes (data swap, resize).

### 10e. Monolithic `ChartContext` re-renders every consumer on every hover

`tooltipData`, `setTooltipData`, `selection`, `clearSelection` (and bar/candle hover indices) live in the same `ChartContextValue` as `data`, `xScale`, `yScale`, dimensions, etc. React context propagates by object identity, so any hover state change → new context value → all `useChart()` consumers re-render (Grid, YAxis, PatternArea, etc.) even though they read nothing volatile.

**Fix:** split into two contexts.

- `ChartContext` — stable slice (data, scales, dimensions, accessors).
- `ChartHoverContext` — volatile slice (tooltipData, selection, hover indices).

Exported hooks:

- `useChart()` — merged, backward-compatible (re-renders on either).
- `useChartStable()` — stable slice only, never re-renders on hover.
- `useChartHover()` — volatile slice only.

In `ChartProvider`, split the input `value` into two slices via two `useMemo`s keyed on individual field identities. When only `tooltipData` changes, the stable slice keeps its identity and stable consumers skip the re-render.

Then migrate consumers that don't read tooltip/selection (Grid, YAxis, PatternArea) to `useChartStable()`. Leave hover-dependent consumers (Line, Area, ChartTooltip, marker components) on `useChart()` for compatibility.

### 10f. Hot-path components recreate `motion` variants per render

`series-point-marker.tsx` rebuilds its `variants` object on every render. This component fans out across every data point in series with markers — for a 200-point series, that's 200 instances allocating fresh variants per hover bucket re-render. Framer re-evaluates animation state on every render even though the variants are identical.

**Fix:** wrap the variants in `useMemo` keyed on `[enterBlur, revealDelay, enterDuration, inactiveOpacity, inactiveBlur, showActiveHighlight, hoverEase]`.

### 10g. Stray `console.log` in `time-series-chart-shell.tsx`

```ts
console.log('re-render TimeSeriesChartCore');
```

Fires on every render of the memoized core. With DevTools open, this is itself a meaningful per-render cost; in any case it's debug spam in production builds.

**Fix:** delete the line.

---

End of list.
