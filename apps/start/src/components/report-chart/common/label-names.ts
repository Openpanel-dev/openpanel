/**
 * The names to show for a series: without the event name when every series
 * shares it, so a breakdown of one event lists only the breakdown values.
 */
export function getLabelNames(allSeries: { names: string[] }[]) {
  const isSharedEvent =
    new Set(allSeries.map((serie) => serie.names[0])).size === 1;
  return (names: string[]) =>
    isSharedEvent && names.length > 1 ? names.slice(1) : names;
}
