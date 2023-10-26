import { useDispatch, useSelector } from "@/redux";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { changeDateRanges, changeInterval } from "./reportSlice";
import { Combobox } from "../ui/combobox";
import { type IInterval } from "@/types";

export function ReportDateRange() {
  const dispatch = useDispatch();
  const interval = useSelector((state) => state.report.interval);
  
  return (
    <>
      <RadioGroup>
        <RadioGroupItem
          onClick={() => {
            dispatch(changeDateRanges('today'));
          }}
        >
          Today
        </RadioGroupItem>
        <RadioGroupItem
          onClick={() => {
            dispatch(changeDateRanges(1));
          }}
        >
          24 hours
        </RadioGroupItem>
        <RadioGroupItem
          onClick={() => {
            dispatch(changeDateRanges(7));
          }}
        >
          7 days
        </RadioGroupItem>
        <RadioGroupItem
          onClick={() => {
            dispatch(changeDateRanges(14));
          }}
        >
          14 days
        </RadioGroupItem>
        <RadioGroupItem
          onClick={() => {
            dispatch(changeDateRanges(30));
          }}
        >
          1 month
        </RadioGroupItem>
        <RadioGroupItem
          onClick={() => {
            dispatch(changeDateRanges(90));
          }}
        >
          3 month
        </RadioGroupItem>
        <RadioGroupItem
          onClick={() => {
            dispatch(changeDateRanges(180));
          }}
        >
          6 month
        </RadioGroupItem>
        <RadioGroupItem
          onClick={() => {
            dispatch(changeDateRanges(356));
          }}
        >
          1 year
        </RadioGroupItem>
      </RadioGroup>
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
        ></Combobox>
      </div>
    </>
  );
}
