import type { RealtimeFilters } from '@openpanel/core/modules/realtime/realtime.constants';
import { parseAsArrayOf, parseAsString, useQueryState } from 'nuqs';

const filterValuesParser = parseAsArrayOf(parseAsString)
  .withDefault([])
  .withOptions({ history: 'push' });

function toggled(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((current) => current !== value)
    : [...values, value];
}

/** Lives in the URL, so a filtered view can be shared or kept on a wall screen. */
export function useRealtimeFilters() {
  const [countries, setCountries] = useQueryState(
    'country',
    filterValuesParser
  );
  const [referrers, setReferrers] = useQueryState(
    'referrer',
    filterValuesParser
  );

  const hasFilters = countries.length > 0 || referrers.length > 0;
  // Undefined when unfiltered, so those query keys match the plain project ones.
  const filters: RealtimeFilters | undefined = hasFilters
    ? { countries, referrers }
    : undefined;

  return {
    filters,
    filtersKey: JSON.stringify(filters ?? null),
    hasFilters,
    countries,
    referrers,
    setCountries,
    setReferrers,
    toggleCountry: (country: string) =>
      setCountries((current) => toggled(current, country)),
    toggleReferrer: (referrer: string) =>
      setReferrers((current) => toggled(current, referrer)),
    clearFilters: () => {
      setCountries([]);
      setReferrers([]);
    },
  };
}
