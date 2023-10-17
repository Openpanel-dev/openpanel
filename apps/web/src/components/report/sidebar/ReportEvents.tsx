import { api } from "@/utils/api";
import { Combobox } from "@/components/ui/combobox";
import { useDispatch, useSelector } from "@/redux";
import { addEvent, changeEvent, removeEvent } from "../reportSlice";
import { ReportEventFilters } from "./ReportEventFilters";
import { useState } from "react";
import { ReportEventMore, type ReportEventMoreProps } from "./ReportEventMore";
import { type IChartEvent } from "@/types";

export function ReportEvents() {
  const [isCreating, setIsCreating] = useState(false);
  const selectedEvents = useSelector((state) => state.report.events);
  const dispatch = useDispatch();
  const eventsQuery = api.chartMeta.events.useQuery();
  const eventsCombobox = (eventsQuery.data ?? []).map((item) => ({
    value: item.name,
    label: item.name,
  }));

  const handleMore = (event: IChartEvent) => {
    const callback: ReportEventMoreProps["onClick"] = (action) => {
      switch (action) {
        case "createFilter": {
          return setIsCreating(true);
        }
        case "remove": {
          return dispatch(removeEvent(event));
        }
      }
    };

    return callback;
  };

  return (
    <div>
      <h3 className="mb-2 font-medium">Events</h3>
      <div className="flex flex-col gap-4">
        {selectedEvents.map((event, index) => {
          return (
            <div key={event.name} className="border rounded-lg">
              <div className="flex gap-2 items-center p-2 px-4">
                <div className="flex-shrink-0 bg-purple-500 w-5 h-5 rounded text-xs flex items-center justify-center text-white font-medium">{index}</div>
                <Combobox
                  value={event.name}
                  onChange={(value) => {
                    dispatch(
                      changeEvent({
                        ...event,
                        name: value,
                        filters: [],
                      }),
                    );
                  }}
                  items={eventsCombobox}
                  placeholder="Select event"
                />
                <ReportEventMore onClick={handleMore(event)} />
              </div>
              <ReportEventFilters
                {...{ isCreating, setIsCreating, event }}

              />
            </div>
          );
        })}

        <Combobox
          value={""}
          onChange={(value) => {
            dispatch(
              addEvent({
                displayName: `${value} (${selectedEvents.length})`,
                name: value,
                filters: [],
              }),
            );
          }}
          items={eventsCombobox}
          placeholder="Select event"
        />
      </div>
    </div>
  );
}
