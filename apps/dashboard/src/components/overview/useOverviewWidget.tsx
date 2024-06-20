import { parseAsStringEnum, useQueryState } from 'nuqs';

import { mapKeys } from '@openpanel/validation';

import type { IChartRoot } from '../report/chart';

export function useOverviewWidget<T extends string>(
  key: string,
  widgets: Record<
    T,
    { title: string; btn: string; chart: IChartRoot; hide?: boolean }
  >
) {
  const keys = Object.keys(widgets) as T[];
  const [widget, setWidget] = useQueryState<T>(
    key,
    parseAsStringEnum(keys)
      .withDefault(keys[0]!)
      .withOptions({ history: 'push' })
  );
  return [
    {
      ...widgets[widget],
      key: widget,
    },
    setWidget,
    mapKeys(widgets).map((key) => ({
      ...widgets[key],
      key,
    })),
  ] as const;
}
