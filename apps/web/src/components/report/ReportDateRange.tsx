import { useDispatch, useSelector } from "@/redux";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { changeDateRanges, changeInterval } from "./reportSlice";
import { Combobox } from "../ui/combobox";
import { type IInterval } from "@/types";
import { timeRanges } from "@/utils/constants";
import { entries } from "@/utils/object";

export function ReportDateRange() {
  const dispatch = useDispatch();
  const interval = useSelector((state) => state.report.interval);
  const chartType = useSelector((state) => state.report.chartType);

  return (
    <>
      <RadioGroup>
        {entries(timeRanges).map(([range, title]) => (
          <RadioGroupItem
            key={range}
            // active={range === interval}
            onClick={() => {
              dispatch(changeDateRanges(range));
            }}
          >
            {title}
          </RadioGroupItem>
        ))}
      </RadioGroup>
      {chartType === "linear" && (
        <div className="w-full max-w-[200px]">
          <Combobox
            placeholder="Interval"
            onChange={(value) => {
              dispatch(changeInterval(value as IInterval));
            }}
            value={interval}
            items={[
              {
                label: "Hour",
                value: "hour",
              },
              {
                label: "Day",
                value: "day",
              },
              {
                label: "Month",
                value: "month",
              },
            ]}
          />
        </div>
      )}
    </>
  );
}
