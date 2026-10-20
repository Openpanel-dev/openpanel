/**
 * Applies a filter command to the overview URL in one navigation, so one
 * command that changes the range and a filter is one history entry and one
 * round of queries. The params match what the overview hooks read:
 * `range`/`start`/`end`/`overrideInterval`, `events`, and `f`.
 */

interface PropertyFilter {
  name: string;
  operator?: string;
  value: string[];
}

export interface FilterCommand {
  applyFilters?: {
    range?: string;
    startDate?: string;
    endDate?: string;
    interval?: string;
  } | null;
  setPropertyFilters?: { filters: PropertyFilter[] } | null;
  setEventNamesFilter?: { eventNames: string[] } | null;
}

function pushUrl(url: URL): void {
  window.history.pushState(null, '', url.toString());
  // nuqs listens for popstate; a pushState alone does not re-render.
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function applyRange(
  url: URL,
  input: NonNullable<FilterCommand['applyFilters']>
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

/** Mirrors `useEventQueryFilters`: `name,operator,value1|value2` joined by `;`. */
function serializePropertyFilters(filters: PropertyFilter[]): string {
  return filters
    .map((filter) => {
      const operator = filter.operator ?? 'is';
      const values = filter.value
        .map((value) => encodeURIComponent(value.trim()))
        .join('|');
      return `${filter.name},${operator},${values}`;
    })
    .join(';');
}

export function applyFilterCommandToUrl(command: FilterCommand): number {
  if (typeof window === 'undefined') {
    return 0;
  }
  const url = new URL(window.location.href);
  let applied = 0;
  if (command.applyFilters) {
    applyRange(url, command.applyFilters);
    applied += 1;
  }
  if (command.setPropertyFilters) {
    if (command.setPropertyFilters.filters.length === 0) {
      url.searchParams.delete('f');
    } else {
      url.searchParams.set(
        'f',
        serializePropertyFilters(command.setPropertyFilters.filters)
      );
    }
    applied += 1;
  }
  if (command.setEventNamesFilter) {
    if (command.setEventNamesFilter.eventNames.length === 0) {
      url.searchParams.delete('events');
    } else {
      url.searchParams.set(
        'events',
        command.setEventNamesFilter.eventNames.join(',')
      );
    }
    applied += 1;
  }
  if (applied > 0) {
    pushUrl(url);
  }
  return applied;
}
