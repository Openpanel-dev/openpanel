import { useFormatDateInterval } from "@/hooks/useFormatDateInterval";
import { useMappings } from "@/hooks/useMappings";
import { useSelector } from "@/redux";
import { type IToolTipProps } from "@/types";

type ReportLineChartTooltipProps = IToolTipProps<{
  color: string;
  value: number;
  payload: {
    date: Date;
    count: number;
    label: string;
  };
}>;

export function ReportLineChartTooltip({
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
  const first = visible[0]!;

  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-white p-3 text-sm shadow-xl">
      {formatDate(new Date(first.payload.date))}
      {visible.map((item) => {
        return (
          <div key={item.payload.label} className="flex gap-2">
            <div
              className="w-[3px] rounded-full"
              style={{ background: item.color }}
            ></div>
            <div className="flex flex-col">
              <div className="min-w-0 max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap font-medium">
                {getLabel(item.payload.label)}
              </div>
              <div>{item.payload.count}</div>
            </div>
          </div>
        );
      })}
      {hidden.length > 0 && (
        <div className="text-muted-foreground">and {hidden.length} more...</div>
      )}
    </div>
  );
}
