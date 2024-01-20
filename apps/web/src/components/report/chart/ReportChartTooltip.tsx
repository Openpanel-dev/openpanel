import { useFormatDateInterval } from '@/hooks/useFormatDateInterval';
import { useMappings } from '@/hooks/useMappings';
import { useSelector } from '@/redux';
import type { IToolTipProps } from '@/types';

type ReportLineChartTooltipProps = IToolTipProps<{
  value: number;
  dataKey: string;
  payload: {
    date: Date;
    count: number;
    label: string;
    color: string;
  } & Record<string, any>;
}>;

export function ReportChartTooltip({
  active,
  payload,
}: ReportLineChartTooltipProps) {
  const getLabel = useMappings();
  const interval = useSelector((state) => state.report.interval);
  const formatDate = useFormatDateInterval(interval);

  if (!active || !payload) {
    return null;
  }

  if (!payload.length) {
    return null;
  }

  const limit = 3;
  const sorted = payload.slice(0).sort((a, b) => b.value - a.value);
  const visible = sorted.slice(0, limit);
  const hidden = sorted.slice(limit);

  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-white p-3 text-sm shadow-xl">
      {visible.map((item, index) => {
        // If we have a <Cell /> component, payload can be nested
        const payload = item.payload.payload ?? item.payload;
        const data = item.dataKey.includes(':')
          ? payload[`${item.dataKey.split(':')[0]}:payload`]
          : payload;

        return (
          <>
            {index === 0 && data.date ? formatDate(new Date(data.date)) : null}
            <div key={item.payload.label} className="flex gap-2">
              <div
                className="w-[3px] rounded-full"
                style={{ background: data.color }}
              />
              <div className="flex flex-col">
                <div className="min-w-0 max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap font-medium">
                  {getLabel(data.label)}
                </div>
                <div>{data.count}</div>
              </div>
            </div>
          </>
        );
      })}
      {hidden.length > 0 && (
        <div className="text-muted-foreground">and {hidden.length} more...</div>
      )}
    </div>
  );
}
