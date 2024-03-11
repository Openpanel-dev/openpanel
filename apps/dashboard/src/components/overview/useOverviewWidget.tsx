import { mapKeys } from '@openpanel/validation';
import type { IChartInput } from '@openpanel/validation';
import { parseAsStringEnum, useQueryState } from 'nuqs';

export function useOverviewWidget<T extends string>(
  key: string,
  widgets: Record<
    T,
    { title: string; btn: string; chart: IChartInput; hide?: boolean }
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
