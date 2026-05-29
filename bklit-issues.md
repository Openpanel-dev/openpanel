# bklit-ui Issues & Patches

Tracking upstream bugs in `@bklitui/ui` (https://ui.bklit.com / `/Users/lindesvard/Projects/bklit-ui`) that we have patched locally after `shadcn add`. Re-running `shadcn add` will regress these fixes — re-apply from this file.

---

## 1. `require("react-dom")` breaks under Vite / ESM bundlers

**Symptom**

```
ReferenceError: require is not defined
    at ChartTooltip (chart-tooltip.tsx:146:28)
```

Thrown at runtime in the browser. The chart renders blank or unmounts.

**Cause**

Six chart components dodge SSR by lazily resolving `createPortal` with CommonJS:

```ts
// Dynamic import to avoid SSR issues
const { createPortal } = require("react-dom") as typeof import("react-dom");
```

This works under Next.js (which polyfills CommonJS in client chunks) but fails under Vite / TanStack Start where browser code stays pure ESM. The lazy resolution isn't even needed — every call site is already guarded by a `mounted` state that flips `true` only inside `useEffect`, so `createPortal` only runs on the client.

**Affected files** (in `apps/start/src/components/charts/`)

- `tooltip/chart-tooltip.tsx`
- `tooltip/tooltip-box.tsx`
- `x-axis.tsx`
- `y-axis.tsx`
- `bar-x-axis.tsx`
- `bar-y-axis.tsx`

**Fix**

Replace the lazy `require` with a top-level static import:

```ts
import { createPortal } from "react-dom";
```

…and delete the inline `const { createPortal } = require(...)` line just before each `createPortal(...)` call. The existing `mounted && container` guard above the call site already prevents SSR execution.

**Upstream**

Present in both the live registry (`https://ui.bklit.com/r/*.json`) and the local source (`/Users/lindesvard/Projects/bklit-ui/packages/ui/src/charts/`). Worth filing / PR'ing upstream.

---

## 2. Registry lags the local `bklit-ui` source

The shadcn registry build at `apps/web/public/r/*.json` is missing newer features (e.g. `dashFromIndex` on `<Line>` / `<Area>`, `<SeriesMarkers>`, `<SeriesDashTailOverlay>`, etc.) that exist in `packages/ui/src/charts/`. We synced these by hand:

- `path-stroke-utils.ts`
- `dash-tail-stroke.tsx`
- `series-dash-tail-overlay.tsx`
- `series-markers.tsx`
- `series-point-marker.tsx`
- `area-gradient-defs.tsx`
- `use-line-segment-highlight.ts`
- `use-area-segment-highlight.ts`
- newer `area.tsx`, `line.tsx`

Until the registry is rebuilt, re-running `shadcn add line-chart` (or similar) will overwrite our patched copies with the older versions and drop these helpers. Sync from local source after each re-install.

---

## 3. `chart-context` cssVars overwrite OpenPanel palette in `.dark`

When `shadcn add` injects the `chart-context` registry item, it appends bklit's grayscale `--chart-1` … `--chart-5` overrides into the `.dark { ... }` block in `styles.css`. OpenPanel's existing palette (`--chart-0` … `--chart-12` defined in `:root` only) is intentionally theme-agnostic; the bklit overrides turn `bg-chart-1`, `text-chart-2`, etc. gray in dark mode across the rest of the app (`billing-usage.tsx`, `__root.tsx`, `report-chart/common/loading.tsx`).

The injection also collapses onto a single line, mangling the `.dark` block formatting.

**Fix**

After re-installing, manually remove the appended `--chart-1..5`, `--chart-background`, `--chart-foreground`, `--chart-grid`, `--chart-crosshair`, `--chart-marker-*`, `--chart-ring-background`, `--chart-label`, `--chart-foreground-muted` lines from `.dark`. Keep only:

```css
--chart-tooltip-background: oklch(from var(--foreground) l c h / 0.92);
--chart-tooltip-foreground: var(--background);
--chart-tooltip-muted: oklch(from var(--background) l c h / 0.6);
```

OpenPanel's bklit tokens in `:root` map back to existing vars so a single `:root` block is enough — see the head of `apps/start/src/styles.css`.

---

## 4. No dual Y-axis (`<ComposedChart>` is single-scale)

Bklit's `ComposedChart` (and every other cartesian shell) computes a single linear Y scale from `max(all series values)`. There is no `yAxisId` / `orientation="right"` equivalent — you cannot mount a second axis with a different domain.

This is a regression vs. recharts, which we relied on in `overview-metrics.tsx` to plot revenue (in cents, e.g. 0–5,000,000) alongside a primary metric (e.g. unique visitors, 0–1,000) on the same chart.

**Workaround in this codebase**

`overview-metrics.tsx` pre-scales `total_revenue` into a derived `revenue_norm` field so the bars share the primary metric's Y domain:

```ts
const scale = (maxPrimary * 0.6) / maxRevenue;
chartData = data.map((item) => ({
  ...item,
  revenue_norm: (item.total_revenue ?? 0) * scale,
}));
```

Bars render at `revenue_norm`; the tooltip shows the real `total_revenue` formatted as currency. Bar height is relative/lossy but visually fits the line/area without dominating.

**Alternatives** if normalization isn't acceptable for a future chart:

- Two stacked bklit charts sharing the X domain (height-split, one per scale).
- Render revenue in a separate widget below the primary chart.
- Patch `composed-chart.tsx` / `time-series-chart-shell.tsx` to accept a second `yScale` (non-trivial — would need a new axis component, new context fields, and changes to tooltip positioning).

---

## 5. X-axis ticks don't line up with data points (default `tickMode="domain"`)

`<XAxis>` defaults to `tickMode="domain"`, which places `numTicks` (default 5) evenly spaced labels across the time domain. Those positions are computed from `xScale.domain()`, not from the actual data points — so the labels rarely coincide with a real tick on the chart. For sparse / non-uniform data (monthly bars, irregular event days) this looks visually off: a label sitting between two bars, or in the middle of a gap.

**Fix**

Pass `tickMode="data"` on the `<XAxis>`:

```tsx
<XAxis tickMode="data" />
```

This emits one label per data row at the row's x position. Matches the recharts behavior we replaced and is the right default for almost every OpenPanel chart.

Not yet applied — should be retrofitted onto `overview-metrics.tsx` and `overview-line-chart.tsx`, and made the default for any new chart.

---

## 6. `<ChartMarkers>` get clipped by the chart `<svg>`

Bklit's `MarkerGroup` renders as SVG (`<g transform="translate(x, y)">`) inside the chart's own `<svg>`, **not** as an HTML portal. With marker `y=-8` and `size=24`, the circle's top edge sits at SVG y = `margin.top - 20`. Anything less than `margin.top: 20` clips the marker.

Bumping `margin.top` works but introduces dead headroom on charts that don't have references on every render.

**Fix (applied)**

Patched both chart shells to render their `<svg>` with `overflow: visible`:

- `apps/start/src/components/charts/time-series-chart-shell.tsx`
- `apps/start/src/components/charts/bar-chart.tsx`

```tsx
<svg aria-hidden="true" height={height} width={width} style={{ overflow: 'visible' }}>
```

With this, markers can render above the chart's bounding box without clipping, regardless of `margin.top`. Restored `margin.top: 16` in `overview-metrics.tsx` so the chart isn't visually top-heavy.

Re-running `shadcn add` will revert these two files.

---

## 7. `<ChartTooltip>` doesn't pick up `<ChartMarkers>` automatically

Bklit's `MarkerTooltipContent` exists, but bklit's `<ChartTooltip>` does not auto-include matched markers — you have to assemble it yourself.

The naive way uses bklit's `useActiveMarkers(markers)` hook. **Don't.** That hook matches by `marker.date.toDateString()`, which is *day*-granular: on an hourly chart every hour of the marker's day shows the reference in the tooltip, even though the visual marker only sits on one hour.

**Fix in OpenPanel**

`<OPChartTooltip>` accepts a `references` prop (same `OPReferenceItem[]` shape as `<OPReferences>`). When set, the tooltip body lists references whose timestamp falls in the bucket of the currently hovered data point — we snap each reference to its nearest data index and compare against `tooltipData.index`, so it works for hourly / minute intervals. See `useReferencesForHoveredPoint` in `apps/start/src/components/charts/op-tooltip.tsx`.

```tsx
<OPChartTooltip
  references={references.data}
  rows={(point) => [...]}
/>
```

Always pass `references` to both `<OPReferences>` (visual marker on the chart) and `<OPChartTooltip>` (text breakdown in the tooltip).

---

## 8. `<Line>` / `<Area>` plot missing values at the chart top (SVG y=0)

bklit's `getY` in both `line.tsx` and `area.tsx`:

```ts
return typeof value === "number" ? (yScale(value) ?? 0) : 0;
```

The fallback `0` is a raw SVG y coordinate, not a data-domain zero. In SVG y=0 is the **top** of the chart, not the baseline — so a series with sparse data (some rows missing `dataKey`) renders the missing points at the ceiling, producing a flat line plastered to the top of the chart.

**Symptom:** in `OverviewLineChart`, hovering at a date where one of the series has no datapoint shows tooltip value `0` for that series, but its hover dot sits at the very top of the chart at Y=max instead of at Y=0.

**Fix (applied locally)** in `apps/start/src/components/charts/line.tsx` and `area.tsx`:

```ts
const getY = useCallback((d) => {
  const value = d[dataKey];
  if (typeof value === "number") {
    return yScale(value) ?? yScale(0) ?? 0;
  }
  return yScale(0) ?? 0;
}, [dataKey, yScale]);
```

`shadcn add` will revert these — re-patch from this file.

---

## 9. Hover springs are tuned slow upstream

Bklit ships hover-related springs that feel sluggish compared to recharts' no-animation defaults — the tooltip box, dot, crosshair, and line/area highlight all visibly ease between data points. OpenPanel charts hover dense time series, so the smoothing reads as lag.

**Files patched to `{ stiffness: 1000, damping: 60 }`** (was 100–300 / 20–30):

- `apps/start/src/components/charts/tooltip/tooltip-box.tsx` (`springConfig`)
- `apps/start/src/components/charts/tooltip/tooltip-dot.tsx` (`crosshairSpringConfig`)
- `apps/start/src/components/charts/tooltip/tooltip-indicator.tsx` (`crosshairSpringConfig`)
- `apps/start/src/components/charts/line.tsx` (highlight `springConfig`)
- `apps/start/src/components/charts/area.tsx` (highlight `springConfig`)

Plus our own `apps/start/src/components/charts/op-date-pill.tsx` (`SPRING`).

`shadcn add` reverts the bklit ones. If hover ever starts feeling laggy again, re-tune these spring constants.

---

## 10. Hover fires `setTooltipData` on every mouse pixel

**Symptom**

Hover over the chart feels sluggish; React DevTools profiler shows the entire chart subtree re-rendering hundreds of times per second during continuous mouse motion.

**Cause**

`use-chart-interaction.ts`'s `handleMouseMove` calls `setTooltipData(resolvedTooltipFromX(chartX))` on every `mousemove` event. But `resolveTooltipFromX` snaps the tooltip to the nearest data bucket — it returns an identical `{ point, index, x, yPositions }` for every pixel inside the same bucket. React still proceeds with the update because the new object reference !== the old one, so every pixel of mouse motion triggers a full chart re-render for no behavioral reason.

**Affected files**

- `apps/start/src/components/charts/use-chart-interaction.ts`

**Fix (applied)**

Wrap `setTooltipData` with a `commitTooltip(next)` helper that tracks the last committed index in a ref and bails out when `next.index === lastTooltipIndexRef.current`. Reset the ref to `-1` on tooltip clear so the next entry into the chart commits fresh. Route every internal call site through `commitTooltip` (handleMouseMove, handleMouseLeave, handleMouseDown, handleTouchStart, handleTouchMove, handleTouchEnd). The exported `setTooltipData` is preserved for external consumers (ChartMarkers, etc.).

State updates drop from ~hundreds/sec → ~tens/sec (only when crossing bucket boundaries).

`shadcn add` reverts.

---

## 11. `useLineSegmentHighlight` does ~30-60 DOM measurements per Line/Area per hover

**Symptom**

Hover is slow on dense data. Profiler shows Line/Area each taking 30-100ms per render with `findPathLengthAtX` dominating.

**Cause**

The shared `use-line-segment-highlight.ts` hook computes the highlight overlay bounds by calling `findPathLengthAtX(targetX)` twice (startX, endX) per render. That function runs a binary search calling `path.getPointAtLength()` per iteration (~10-20 DOM calls per search, each ~1-3ms). With 2 series and per-bucket hover re-renders, this single pattern dominates hover cost.

**Upstream**

Bklit issue #54 (closed) fixed this in `area.tsx`'s old inline `findLengthAtX` callback by switching to chord-length approximation — but the shared hook was never updated, and `line.tsx` continued calling the slow path through the hook.

**Affected files**

- `apps/start/src/components/charts/use-line-segment-highlight.ts` (rewrite)
- `apps/start/src/components/charts/line.tsx` (caller — drop `pathRef`, pass `yScale`/`dataKey`)
- `apps/start/src/components/charts/area.tsx` (caller — drop `pathRef`, pass `yScale`/`dataKey`)

**Fix (applied)**

Rewrote the hook to pre-compute cumulative chord lengths between data points in pixel space (pure arithmetic), then scale them by `pathLength / totalChordLength` so the dasharray still aligns with the real curved SVG path. The chord pass is memoized on `(data, scales, dataKey)` — runs once on data change, never on hover. Removed the `pathRef` parameter; added `yScale` and `dataKey` (needed for y-pixel computation).

`SeriesDashTailOverlay` still uses `findPathLengthAtX` separately (see item 13). The remaining direct usage is fine because that component runs once per geometry change, not per hover.

`shadcn add` reverts.

---

## 12. `line.tsx` uses `useEffect` to set highlight springs (double-render cycle)

**Symptom**

Every hover bucket boundary triggers two render cycles per Line.

**Cause**

```ts
useEffect(() => {
  offsetSpring.set(-segmentBounds.startLength);
  segmentLengthSpring.set(segmentBounds.segmentLength);
}, [segmentBounds.startLength, segmentBounds.segmentLength, ...]);
```

The effect fires after paint, calling `spring.set()` which schedules its own frame — but the effect itself ran inside a React commit, so React's reconciler does a second render to settle. Motion's `useSpring` is designed to be set imperatively in render, no effect needed.

**Upstream**

Bklit issue #54 (closed) fixed this pattern across `area.tsx`, `tooltip-dot.tsx`, `tooltip-indicator.tsx`, `tooltip/chart-tooltip.tsx`, `date-ticker.tsx`, `tooltip-box.tsx` — but missed `line.tsx`.

**Affected files**

- `apps/start/src/components/charts/line.tsx`

**Fix (applied)**

Inline the spring calls directly in the render body (no useEffect):

```ts
const offsetSpring = useSpring(0, springConfig);
const segmentLengthSpring = useSpring(0, springConfig);
offsetSpring.set(-segmentBounds.startLength);
segmentLengthSpring.set(segmentBounds.segmentLength);
```

`shadcn add` reverts.

---

## 13. `SeriesDashTailOverlay` re-runs `findPathLengthAtX` on every Area re-render

**Symptom**

Profiler showed `SeriesDashTailOverlay` at ~72ms self-time per hover bucket on dense series, dominating Area's total render cost.

**Cause**

The overlay calls `findPathLengthAtX(pathRef.current, pathLength, dashStartX)` in its render body. Its props (data, pathLength, scales, dashFromIndex) are all stable on hover, but the component re-renders every time Area re-renders, re-running the ~30-60 DOM-call binary search for no reason.

**Affected files**

- `apps/start/src/components/charts/series-dash-tail-overlay.tsx`

**Fix (applied)**

Wrap the component in `React.memo`. With stable props on hover, shallow comparison lets Area's per-bucket re-render skip the entire subtree. The binary search now runs only when path geometry actually changes (data swap, resize).

`shadcn add` reverts.

---

## 14. Implicit `Intl` constructors + `Math.random()` IDs in render path

**Symptom**

Constant allocation pressure during interaction; SSR hydration mismatch hazard from gradient IDs.

**Cause**

Two related issues:

- `.toLocaleDateString("en-US", { ... })` and `.toLocaleString()` inside `.map()` loops allocate a fresh `Intl.DateTimeFormat` / `Intl.NumberFormat` per call (each ~10-50× slower than reusing one).
- `area.tsx` and `line.tsx` generate SVG gradient IDs with `\`...-${Math.random().toString(36).slice(2, 9)}\`` inside a `useMemo`. Violates render purity (memoized values must be deterministic) and is a documented SSR hydration-mismatch source.

**Upstream**

Bklit issue #64 (open).

**Affected files**

New shared module:
- `apps/start/src/components/charts/chart-formatters.ts` — exports module-scope `shortDateFmt`, `weekdayDateFmt`, `hmsTimeFmt`, `intFmt`.

Call sites patched to import from `chart-formatters`:
- `apps/start/src/components/charts/area.tsx` (`useId()` for gradient IDs)
- `apps/start/src/components/charts/line.tsx` (`useId()` for gradient IDs)
- `apps/start/src/components/charts/x-axis.tsx` (`shortDateFmt`)
- `apps/start/src/components/charts/time-series-chart-shell.tsx` (`shortDateFmt`)
- `apps/start/src/components/charts/tooltip/chart-tooltip.tsx` (`weekdayDateFmt`)
- `apps/start/src/components/charts/tooltip/tooltip-content.tsx` (`intFmt`)

**Fix (applied)**

Created `chart-formatters.ts` with module-scope formatters. Replaced each `.toLocaleX(...)` call site with `<formatter>.format(value)` / `intFmt(value)`. Replaced `Math.random()` ID generators with `useId()`.

Output strings are byte-equivalent; SVG attribute shape changes (`:r1:` style instead of base36 random) but never user-visible.

`shadcn add` reverts.

---

## 15. Components run expensive `useMemo` work before their early-return guard

**Symptom**

Wasted scale/tick/label computation on pre-mount renders, hidden charts, and renders where the container ref hasn't attached yet.

**Cause**

```tsx
function XAxis(props) {
  const labelsToShow = useMemo(/* expensive */, [...]); // runs first
  if (!(mounted && container)) return null;            // …then bails
  return /* render */;
}
```

Rules of Hooks forbids hoisting the guard above the memos. Result: every render where the guard fails still pays for the memos.

**Upstream**

Bklit issue #65 (open).

**Affected files**

Patched with the wrapper / memoized-inner split:
- `apps/start/src/components/charts/x-axis.tsx`
- `apps/start/src/components/charts/y-axis.tsx`
- `apps/start/src/components/charts/tooltip/chart-tooltip.tsx`
- `apps/start/src/components/charts/time-series-chart-shell.tsx`

**Fix (applied)**

Extract a thin outer wrapper that owns the guard, and move all expensive hooks into a `React.memo`-wrapped `*Inner` component:

```tsx
export function XAxis(props) {
  const { mounted, container } = ... ; // only the guard's own hooks
  if (!(mounted && container)) return null;
  return <XAxisInner container={container} {...props} />;
}

const XAxisInner = memo(function XAxisInner({ container, ...props }) {
  const labelsToShow = useMemo(/* expensive */, [...]);
  return /* render */;
});
```

`time-series-chart-shell.tsx` additionally wraps its `contextValue` in `useMemo` so consumers don't re-render from a fresh object identity when no actual state moved.

`shadcn add` reverts.

---

## 16. Monolithic `ChartContext` re-renders every consumer on every hover

**Symptom**

Hover bucket changes re-render the entire chart subtree — Grid, YAxis, PatternArea, OPReferrerSpikes, etc. — even though none of them read tooltip/selection state.

**Cause**

`tooltipData`, `setTooltipData`, `selection`, `clearSelection` (and bar/candle hover indices) live in the same `ChartContextValue` as `data`, `xScale`, `yScale`, dimensions, etc. React context propagates by object identity, so any hover state change → new context value → all `useChart()` consumers re-render.

**Affected files**

- `apps/start/src/components/charts/chart-context.tsx` (split)
- `apps/start/src/components/charts/grid.tsx` (migrate to `useChartStable`)
- `apps/start/src/components/charts/pattern-area.tsx` (migrate to `useChartStable`)
- `apps/start/src/components/charts/y-axis.tsx` (migrate to `useChartStable`)

Plus our own `apps/start/src/components/charts/op-referrer-spikes.tsx` (migrate to `useChartStable`).

**Fix (applied)**

Split `ChartContext` into two underlying contexts:

- `ChartContext` — stable slice (data, scales, dimensions, accessors).
- `ChartHoverContext` — volatile slice (tooltipData, selection, hover indices).

Exported hooks:

- `useChart()` — merged, backward-compat (re-renders on either change).
- `useChartStable()` — stable slice only, never re-renders on hover.
- `useChartHover()` — volatile slice only.

`ChartProvider` splits the input `value` into the two slices via two `useMemo`s keyed on individual field identities. When only `tooltipData` changes, the stable slice keeps its identity and stable consumers skip the re-render.

Then migrated every chart consumer that does NOT read tooltip/selection to `useChartStable()` (Grid, YAxis, PatternArea, OPReferrerSpikes). Consumers that need hover state (Line, Area, ChartTooltip, OPDatePill, OPSeriesDots, markers) keep `useChart()` for now — could be further split into `useChartStable()` + `useChartHover()` if profiling shows them still hot.

When re-adding any of these files via `shadcn add`, also re-add the `useChartStable` import swap.

---

## 17. Hot-path components recreate `motion` variants and inline styles per render

**Symptom**

Allocation churn in `motion` variants; framer re-evaluates animation state on every render even though the variants are identical.

**Affected files**

- `apps/start/src/components/charts/series-point-marker.tsx` — `variants` object rebuilt on every render (this component fans out across every data point in series with markers).

Plus our own:
- `apps/start/src/components/charts/op-date-pill.tsx` — `maxWidth` recomputed inline.
- `apps/start/src/components/charts/op-tooltip.tsx` — `OPAnnotationRow.badgeStyle` recomputed inline per annotation per render.

**Fix (applied)**

Wrap each in `useMemo` keyed on the actual style inputs. For `series-point-marker.tsx`: `[enterBlur, revealDelay, enterDuration, inactiveOpacity, inactiveBlur, showActiveHighlight, hoverEase]`.

`shadcn add` reverts the bklit file. Our two files have no regression risk.

---

## 18. Stray `console.log` in `time-series-chart-shell.tsx`

**Symptom**

Console spam during interaction; possible noticeable cost in DevTools-open sessions.

**Cause**

Debug log left in from an earlier optimization pass:

```ts
console.log('re-render TimeSeriesChartCore');
```

Fired on every render of the memoized core (and is itself a meaningful per-render cost in dev with console open).

**Affected files**

- `apps/start/src/components/charts/time-series-chart-shell.tsx`

**Fix (applied)**

Deleted the line. If re-applying after `shadcn add`, just verify no stray debug logs were re-introduced.

---

## 19. MarkerGroup doesn't support filled-icon or custom-border markers

**Symptom**

Bklit's marker icons render small (16px) inside a 24px circle with a fixed amber/theme-border outline — no way to render an "app icon" style marker where the favicon fills the circle and the border picks up a custom color.

**Cause**

`MarkerCircle` and `MarkerCircleHTML` in `marker-group.tsx` hard-code:
- `foreignObject` size = `size - 8` with a 4px inset, leaving the icon visibly smaller than the circle.
- `stroke` = `chartCssVars.markerBorder` (no override).

**Affected files**

- `apps/start/src/components/charts/markers/marker-group.tsx`

**Fix (applied)**

Added two optional props to `MarkerGroupProps` (forwarded to both `MarkerCircle` and `MarkerCircleHTML`):

```ts
iconFill?: boolean;   // foreignObject = size × size, clips to circle
borderColor?: string; // overrides stroke color
```

Implementation:

```tsx
const inset = iconFill ? 0 : 4;
const foSize = size - inset * 2;
// ...
stroke={borderColor || chartCssVars.markerBorder}
// foreignObject uses foSize / inset
// inner div: overflow: 'hidden', borderRadius: iconFill ? '50%' : undefined
```

Backward compat preserved (defaults off). Used by `op-marker-layer.tsx` to give all OpenPanel chart annotations the "app icon" look (favicon edge-to-edge with a foreground-colored border).

Also requires `report-chart/common/serie-icon.tsx`'s `fill?: boolean` prop (our own file, no shadcn regression risk) — when set, images render `size-full rounded-full object-cover` instead of the default `max-h-4` cap so they actually fill the larger `foreignObject`.

`shadcn add` reverts the bklit patch.
