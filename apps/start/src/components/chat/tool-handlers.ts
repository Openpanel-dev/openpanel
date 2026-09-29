import type {
  ApplyFiltersInput,
  ChatClientToolHandlers,
  SetEventNamesFilterInput,
  SetPropertyFiltersInput,
} from '@openpanel/core/modules/assistant/assistant.constants';

/**
 * Client-side handlers for tools the LLM can invoke to mutate page
 * state. Better Agent emits these as `tool-call` parts with no server
 * execution; the controller forwards each call to the matching entry
 * here, and the return value is sent back as the tool's `output`.
 *
 * Keep handlers tiny and side-effect-only — they shouldn't render UI
 * or maintain state of their own.
 *
 * URL params we mutate map 1:1 to what the dashboard hooks read:
 *   - `range`, `start`, `end`, `overrideInterval` ← `useOverviewOptions`
 *   - `events`                                    ← `useEventQueryNamesFilter`
 *   - `f`                                         ← `useEventQueryFilters`
 *
 * After mutating the URL we dispatch a `popstate` event so nuqs picks
 * up the change without a hook subscription on our side.
 *
 * Handler types come from `@openpanel/core`'s assistant.constants (shared
 * with the server's tool schemas) so the map stays in sync with the Zod inputs
 * without crossing the app boundary for its type.
 */

type PropertyFilter = SetPropertyFiltersInput['filters'][number];

function pushUrl(url: URL): void {
  window.history.pushState(null, '', url.toString());
  window.dispatchEvent(new PopStateEvent('popstate'));
}

// Each of these mutates a URL rather than navigating, so one command that
// changes a range AND a filter results in one history entry and one round of
// queries instead of two or three.
function applyFiltersToUrl(
  url: URL,
  input: Omit<ApplyFiltersInput, 'range'> & { range?: string }
): void {
  if (input.startDate && input.endDate) {
    url.searchParams.set('range', 'custom');
    url.searchParams.set('start', input.startDate);
    url.searchParams.set('end', input.endDate);
  } else if (input.range) {
    url.searchParams.set('range', input.range);
    url.searchParams.delete('start');
    url.searchParams.delete('end');
  }

  if (input.interval) {
    url.searchParams.set('overrideInterval', input.interval);
  }
}

function setPropertyFiltersOnUrl(
  url: URL,
  input: {
    filters: (Omit<PropertyFilter, 'operator'> & { operator?: string })[];
  }
): void {
  if (input.filters.length === 0) {
    url.searchParams.delete('f');
  } else {
    url.searchParams.set('f', serializePropertyFilters(input.filters));
  }
}

function setEventNamesFilterOnUrl(
  url: URL,
  input: SetEventNamesFilterInput
): void {
  if (input.eventNames.length === 0) {
    url.searchParams.delete('events');
  } else {
    // nuqs `parseAsArrayOf(parseAsString)` defaults to comma-separated.
    url.searchParams.set('events', input.eventNames.join(','));
  }
}

function applyFilters(input: ApplyFiltersInput): {
  applied: boolean;
  applied_filters: ApplyFiltersInput;
} {
  if (typeof window === 'undefined') {
    return { applied: false, applied_filters: input };
  }
  const url = new URL(window.location.href);
  applyFiltersToUrl(url, input);
  pushUrl(url);
  return { applied: true, applied_filters: input };
}

/**
 * Mirrors the serializer in `useEventQueryFilters` — each filter is
 * `name,operator,value1|value2`, joined by `;`. We URL-encode the
 * values to match the parser.
 */
function serializePropertyFilters(
  filters: (Omit<PropertyFilter, 'operator'> & { operator?: string })[]
): string {
  return filters
    .map((f) => {
      const op = f.operator ?? 'is';
      const values = f.value.map((v) => encodeURIComponent(v.trim())).join('|');
      return `${f.name},${op},${values}`;
    })
    .join(';');
}

function setPropertyFilters(input: SetPropertyFiltersInput): {
  applied: boolean;
  count: number;
} {
  if (typeof window === 'undefined') {
    return { applied: false, count: 0 };
  }
  const url = new URL(window.location.href);
  setPropertyFiltersOnUrl(url, input);
  pushUrl(url);
  return { applied: true, count: input.filters.length };
}

function setEventNamesFilter(input: SetEventNamesFilterInput): {
  applied: boolean;
  count: number;
} {
  if (typeof window === 'undefined') {
    return { applied: false, count: 0 };
  }
  const url = new URL(window.location.href);
  setEventNamesFilterOnUrl(url, input);
  pushUrl(url);
  return { applied: true, count: input.eventNames.length };
}

export const chatToolHandlers: ChatClientToolHandlers = {
  apply_filters: async (input) => applyFilters(input as ApplyFiltersInput),
  set_property_filters: async (input) =>
    setPropertyFilters(input as SetPropertyFiltersInput),
  set_event_names_filter: async (input) =>
    setEventNamesFilter(input as SetEventNamesFilterInput),
};

/**
 * Applies every part of one filter command in a single navigation.
 *
 * The overview's AI command used to await the three handlers in turn, so a
 * command like "last 30 days, mobile only" pushed two history entries and ran
 * every overview query twice.
 */
export function applyFilterCommandToUrl(command: {
  // `range` and `operator` are widened to `string` on purpose.
  // `overview.runFilterCommand` validates against the canonical `zRange` and
  // operator list, while the chat tool's own schemas in assistant.constants.ts
  // hand-list subsets: they are missing `last24h` and `3m` for range, and
  // `inCohort`/`notInCohort` for operator. Both values are written verbatim
  // into search params that the overview's own parsers then validate, so the
  // wider types are correct here — and they keep the drift visible instead of
  // hiding it behind the cast the tool-handler map used to apply.
  applyFilters?: (Omit<ApplyFiltersInput, 'range'> & { range?: string }) | null;
  setPropertyFilters?: {
    filters: (Omit<PropertyFilter, 'operator'> & { operator?: string })[];
  } | null;
  setEventNamesFilter?: SetEventNamesFilterInput | null;
}): number {
  if (typeof window === 'undefined') {
    return 0;
  }
  const url = new URL(window.location.href);
  let applied = 0;
  if (command.applyFilters) {
    applyFiltersToUrl(url, command.applyFilters);
    applied += 1;
  }
  if (command.setPropertyFilters) {
    setPropertyFiltersOnUrl(url, command.setPropertyFilters);
    applied += 1;
  }
  if (command.setEventNamesFilter) {
    setEventNamesFilterOnUrl(url, command.setEventNamesFilter);
    applied += 1;
  }
  if (applied > 0) {
    pushUrl(url);
  }
  return applied;
}
