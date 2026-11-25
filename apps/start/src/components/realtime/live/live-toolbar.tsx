import { useQuery } from '@tanstack/react-query';
import { GlobeIcon, LinkIcon, XIcon } from 'lucide-react';
import { LiveCustomize } from './live-customize';
import type { RealtimeLayout } from './live-layout';
import { useRealtimeFilters } from './use-realtime-filters';
import { Button } from '@/components/ui/button';
import {
  ToolbarMultiSelect,
  type ToolbarMultiSelectOption,
} from '@/components/ui/toolbar-select';
import { useTRPC } from '@/integrations/trpc/react';
import { getCountry } from '@/translations/countries';

const TOOLBAR_SURFACE = 'bg-card/85 backdrop-blur-md';

/** A picked value can drop out of the window; it must stay there to unpick. */
function withSelected(
  options: ToolbarMultiSelectOption[],
  selected: string[],
  getLabel: (value: string) => string = (value) => value
): ToolbarMultiSelectOption[] {
  const missing = selected
    .filter((value) => !options.some((option) => option.value === value))
    .map((value) => ({ value, label: getLabel(value) }));

  return [...missing, ...options];
}

function getCountryLabel(country: string) {
  return getCountry(country) ?? country;
}

export function LiveToolbar({
  projectId,
  layout,
  onLayoutChange,
  onLayoutReset,
}: {
  projectId: string;
  layout: RealtimeLayout | null;
  onLayoutChange: (layout: RealtimeLayout) => void;
  onLayoutReset: () => void;
}) {
  const trpc = useTRPC();
  const {
    countries,
    referrers,
    hasFilters,
    setCountries,
    setReferrers,
    clearFilters,
  } = useRealtimeFilters();
  const { data } = useQuery(
    trpc.realtime.filterOptions.queryOptions({ projectId })
  );

  const countryOptions = (data?.countries ?? []).map((row) => ({
    value: row.country,
    label: getCountryLabel(row.country),
    count: row.sessions,
  }));
  const referrerOptions = (data?.referrers ?? []).map((row) => ({
    value: row.name,
    count: row.sessions,
  }));

  return (
    <div className="pointer-events-none absolute inset-x-4 top-6 flex justify-center md:inset-x-80">
      <div className="pointer-events-auto flex flex-wrap justify-center gap-2">
        <ToolbarMultiSelect
          className={TOOLBAR_SURFACE}
          emptyText="No countries right now"
          icon={GlobeIcon}
          label="Country"
          onChange={setCountries}
          options={withSelected(countryOptions, countries, getCountryLabel)}
          selected={countries}
        />
        <ToolbarMultiSelect
          className={TOOLBAR_SURFACE}
          emptyText="No referrers right now"
          icon={LinkIcon}
          label="Referrer"
          onChange={setReferrers}
          options={withSelected(referrerOptions, referrers)}
          selected={referrers}
        />
        {hasFilters ? (
          <Button
            className={TOOLBAR_SURFACE}
            icon={XIcon}
            onClick={clearFilters}
            variant="outline"
          >
            Clear
          </Button>
        ) : null}
        {layout ? (
          <div className="hidden md:block">
            <LiveCustomize
              layout={layout}
              onChange={onLayoutChange}
              onReset={onLayoutReset}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
