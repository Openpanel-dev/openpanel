import type { ServiceDeps } from '../../../services';
import { getEventMetasCached } from '../../event/event.service';

/** A report series, or a funnel step, which carries no `type`. */
interface Nameable {
  type?: string;
  name?: string;
  displayName?: string;
  customEventId?: string;
}

/**
 * Names each event series after its project display name. A name set on the
 * report wins, and a custom event already carries its own name.
 */
export function withEventDisplayNames<T extends Nameable>(
  series: T[],
  displayNames: Map<string, string>
): T[] {
  return series.map((item) => {
    const isNamed = item.displayName || item.customEventId;
    if (item.type === 'formula' || isNamed || !item.name) {
      return item;
    }
    const displayName = displayNames.get(item.name);
    return displayName ? { ...item, displayName } : item;
  });
}

export async function applyEventDisplayNames<T extends Nameable>(
  deps: ServiceDeps,
  projectId: string,
  series: T[]
): Promise<T[]> {
  const metas = await getEventMetasCached(deps, projectId);
  const displayNames = new Map<string, string>();
  for (const meta of metas) {
    if (meta.displayName) {
      displayNames.set(meta.name, meta.displayName);
    }
  }
  return displayNames.size > 0
    ? withEventDisplayNames(series, displayNames)
    : series;
}
