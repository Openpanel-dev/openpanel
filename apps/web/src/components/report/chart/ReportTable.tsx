import * as React from "react";
import { type RouterOutputs } from "@/utils/api";
import { useFormatDateInterval } from "@/hooks/useFormatDateInterval";
import { useSelector } from "@/redux";
import { Checkbox } from "@/components/ui/checkbox";
import { getChartColor } from "@/utils/theme";

export function ReportTable({
  data,
}: {
  data: RouterOutputs["chartMeta"]["chart"];
}) {
  const interval = useSelector((state) => state.report.interval);
  const formatDate = useFormatDateInterval(interval);

  return (
    <div className="flex min-w-0">
      {/* Labels */}
      <div>
        <div className="font-medium">Name</div>
        {data.series.map((serie, index) => {
          const checked = index < 5;
          return (
            <div
              key={serie.name}
              className="max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap flex items-center gap-2"
            >
              <Checkbox
                style={checked ? {
                  background: getChartColor(index),
                  borderColor: getChartColor(index),
                } : undefined}
                checked={checked}
              />
              {serie.name}
            </div>
          );
        })}
      </div>

      {/* ScrollView for all values */}
      <div className="min-w-0 overflow-auto">
        {/* Header */}
        <div className="flex">
          {data.series[0]?.data.map((serie, index) => (
            <div
              key={serie.date.toString()}
              className="min-w-[80px] text-right font-medium"
            >
              {formatDate(serie.date)}
            </div>
          ))}
        </div>

        {/* Values */}
        {data.series.map((serie, index) => {
          return (
            <div className="flex" key={serie.name}>
              {serie.data.map((item) => {
                return (
                  <div key={item.date} className="min-w-[80px] text-right">
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
