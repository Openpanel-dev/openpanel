import { z } from 'zod';

export const REALTIME_FILTER_VALUES_MAX = 50;

const zFilterValues = z.array(z.string()).max(REALTIME_FILTER_VALUES_MAX);

export const zRealtimeFilters = z.object({
  countries: zFilterValues.optional(),
  /** Hostnames or referrer names, as `realtime.topSources` returns them. */
  referrers: zFilterValues.optional(),
});

export type RealtimeFilters = z.infer<typeof zRealtimeFilters>;
