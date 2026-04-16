import type {
  ApplyFiltersInput,
  ChatClientToolHandlers,
  SetEventNamesFilterInput,
  SetPropertyFiltersInput,
} from '@openpanel/validation';

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
 * Handler types come from `@openpanel/validation` (shared with the
 * server's tool schemas) so the map stays in sync with the Zod inputs
 * without crossing the app boundary for its type.
 */

type PropertyFilter = SetPropertyFiltersInput['filters'][number];

function pushUrl(url: URL): void {
  window.history.pushState(null, '', url.toString());
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function applyFilters(input: ApplyFiltersInput): {
  applied: boolean;
  applied_filters: ApplyFiltersInput;
} {
  if (typeof window === 'undefined') {
    return { applied: false, applied_filters: input };
  }
  const url = new URL(window.location.href);

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

  pushUrl(url);
  return { applied: true, applied_filters: input };
}

/**
 * Mirrors the serializer in `useEventQueryFilters` — each filter is
 * `name,operator,value1|value2`, joined by `;`. We URL-encode the
 * values to match the parser.
 */
function serializePropertyFilters(filters: PropertyFilter[]): string {
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
  if (input.filters.length === 0) {
    url.searchParams.delete('f');
  } else {
    url.searchParams.set('f', serializePropertyFilters(input.filters));
  }
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
  if (input.eventNames.length === 0) {
    url.searchParams.delete('events');
  } else {
    // nuqs `parseAsArrayOf(parseAsString)` defaults to comma-separated.
    url.searchParams.set('events', input.eventNames.join(','));
  }
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
