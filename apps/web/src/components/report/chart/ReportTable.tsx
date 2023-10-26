import * as React from "react";
import { type RouterOutputs } from "@/utils/api";
import { useFormatDateInterval } from "@/hooks/useFormatDateInterval";
import { useSelector } from "@/redux";
import { Checkbox } from "@/components/ui/checkbox";
import { getChartColor } from "@/utils/theme";
import { cn } from "@/utils/cn";
import { useMappings } from "@/hooks/useMappings";


type ReportTableProps = {
  data: RouterOutputs["chart"]["chart"];
  visibleSeries: string[];
  setVisibleSeries: React.Dispatch<React.SetStateAction<string[]>>;
};

export function ReportTable({
  data,
  visibleSeries,
  setVisibleSeries,
}: ReportTableProps) {
  const interval = useSelector((state) => state.report.interval);
  const formatDate = useFormatDateInterval(interval);
  const getLabel = useMappings()

  function handleChange(name: string, checked: boolean) {
    setVisibleSeries((prev) => {
      if (checked) {
        return [...prev, name];
      } else {
        return prev.filter((item) => item !== name);
      }
    });
  }

  const row = "flex border-b border-border last:border-b-0 flex-1";
  const cell = "p-2 last:pr-8 last:w-[8rem]";
  const value = "min-w-[6rem] text-right";
  const header = "text-sm font-medium";
  const total = 'bg-gray-50 text-emerald-600 font-medium border-r border-border'
  return (
    <div className="flex w-fit max-w-full rounded-md border border-border">
      {/* Labels */}
      <div className="border-r border-border">
        <div className={cn(header, row, cell)}>Name</div>
        {data.series.map((serie, index) => {
          const checked = visibleSeries.includes(serie.name);

          return (
            <div
              key={serie.name}
              className={cn("flex max-w-[200px] items-center gap-2", row, cell)}
            >
              <Checkbox
                onCheckedChange={(checked) =>
                  handleChange(serie.name, !!checked)
                }
                style={
                  checked
                    ? {
                        background: getChartColor(index),
                        borderColor: getChartColor(index),
                      }
                    : undefined
                }
                checked={checked}
              />
              <div className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                {getLabel(serie.name)}
              </div>
            </div>
          );
        })}
      </div>

      {/* ScrollView for all values */}
      <div className="w-full overflow-auto">
        {/* Header */}
        <div className={cn("w-max", row)}>
          <div className={cn(header, value, cell, total)}>Total</div>
          {data.series[0]?.data.map((serie) => (
            <div
              key={serie.date.toString()}
              className={cn(header, value, cell)}
            >
              {formatDate(serie.date)}
            </div>
          ))}
        </div>

        {/* Values */}
        {data.series.map((serie) => {
          return (
            <div className={cn("w-max", row)} key={serie.name}>
              <div className={cn(header, value, cell, total)}>{serie.totalCount}</div>
              {serie.data.map((item) => {
                return (
                  <div key={item.date} className={cn(value, cell)}>
                    {item.count}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
