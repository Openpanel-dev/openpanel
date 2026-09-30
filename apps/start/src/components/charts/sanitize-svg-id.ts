/**
 * React `useId()` historically produced ids like `:r1:` / `«r0»` that are
 * invalid inside SVG `url(#…)` references on Safari. Strip anything that
 * is not a safe SVG/XML Name character so fills, masks, and clipPaths resolve.
 */
export function sanitizeSvgId(id: string): string {
  const cleaned = id.replace(/[^A-Za-z0-9_-]/g, "");
  // SVG ids must not start with a digit.
  return cleaned.length === 0 || /^[0-9]/.test(cleaned)
    ? `svg-${cleaned || "id"}`
    : cleaned;
}
