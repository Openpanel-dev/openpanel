import { api } from "@/utils/api";
import {
  type IChartEvent,
  type IChartEventFilterValue,
  type IChartEventFilter,
} from "@/types";
import { CreditCard, SlidersHorizontal, Trash } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { type Dispatch } from "react";
import { RenderDots } from "@/components/ui/RenderDots";
import { useDispatch } from "@/redux";
import { changeEvent } from "../reportSlice";
import { Button } from "@/components/ui/button";
import { ComboboxMulti } from "@/components/ui/combobox-multi";
import { Dropdown } from "@/components/Dropdown";
import { operators } from "@/utils/constants";
import { useMappings } from "@/hooks/useMappings";

type ReportEventFiltersProps = {
  event: IChartEvent;
  isCreating: boolean;
  setIsCreating: Dispatch<boolean>;
};

export function ReportEventFilters({
  event,
  isCreating,
  setIsCreating,
}: ReportEventFiltersProps) {
  const dispatch = useDispatch();
  const propertiesQuery = api.chart.properties.useQuery(
    {
      event: event.name,
    },
    {
      enabled: !!event.name,
    },
  );

  return (
    <div>
      <div className="flex flex-col divide-y bg-slate-50">
        {event.filters.map((filter) => {
          return <Filter key={filter.name} filter={filter} event={event} />;
        })}

        <CommandDialog open={isCreating} onOpenChange={setIsCreating} modal>
          <CommandInput placeholder="Search properties" />
          <CommandList>
            <CommandEmpty>Such emptyness 🤨</CommandEmpty>
            <CommandGroup heading="Properties">
              {propertiesQuery.data?.map((item) => (
                <CommandItem
                  key={item}
                  onSelect={() => {
                    setIsCreating(false);
                    dispatch(
                      changeEvent({
                        ...event,
                        filters: [
                          ...event.filters,
                          {
                            id: (event.filters.length + 1).toString(),
                            name: item,
                            operator: "is",
                            value: [],
                          },
                        ],
                      }),
                    );
                  }}
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  <RenderDots className="text-sm">{item}</RenderDots>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </CommandList>
        </CommandDialog>
      </div>
    </div>
  );
}

type FilterProps = {
  event: IChartEvent;
  filter: IChartEvent["filters"][number];
};

function Filter({ filter, event }: FilterProps) {
  const getLabel = useMappings()
  const dispatch = useDispatch();
  const potentialValues = api.chart.values.useQuery({
    event: event.name,
    property: filter.name,
  });

  const valuesCombobox =
    potentialValues.data?.values?.map((item) => ({
      value: item,
      label: getLabel(item),
    })) ?? [];

  const removeFilter = () => {
    dispatch(
      changeEvent({
        ...event,
        filters: event.filters.filter((item) => item.id !== filter.id),
      }),
    );
  };

  const changeFilterValue = (
    value: IChartEventFilterValue | IChartEventFilterValue[],
  ) => {
    dispatch(
      changeEvent({
        ...event,
        filters: event.filters.map((item) => {
          if (item.id === filter.id) {
            return {
              ...item,
              value: Array.isArray(value) ? value : [value],
            };
          }

          return item;
        }),
      }),
    );
  };

  const changeFilterOperator = (operator: IChartEventFilter["operator"]) => {
    dispatch(
      changeEvent({
        ...event,
        filters: event.filters.map((item) => {
          if (item.id === filter.id) {
            return {
              ...item,
              operator,
            };
          }

          return item;
        }),
      }),
    );
  };

  return (
    <div
      key={filter.name}
      className="px-4 py-2 shadow-[inset_6px_0_0] shadow-slate-200 first:border-t"
    >
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-emerald-600 text-xs font-medium text-white">
          <SlidersHorizontal size={10} />
        </div>
        <div className="flex flex-1 text-sm">
        <RenderDots truncate>{filter.name}</RenderDots>
        </div>
        <Button variant="ghost" size="sm" onClick={removeFilter}>
          <Trash size={16} />
        </Button>
      </div>
      <div className="flex gap-1">
        <Dropdown
          onChange={changeFilterOperator}
          items={Object.entries(operators).map(([key, value]) => ({
            value: key as IChartEventFilter["operator"],
            label: value,
          }))}
          label="Segment"
        >
          <Button variant={"ghost"} className="whitespace-nowrap">
            {operators[filter.operator]}
          </Button>
        </Dropdown>
        <ComboboxMulti
          placeholder="Select values"
          items={valuesCombobox}
          selected={filter.value.map((item) => ({
            value: item?.toString() ?? "__filter_value_null__",
            label: getLabel(item?.toString() ?? "__filter_value_null__"),
          }))}
          setSelected={(setFn) => {
            if(typeof setFn === "function") {
              const newValues = setFn(
                filter.value.map((item) => ({
                  value: item?.toString() ?? "__filter_value_null__",
                  label: getLabel(item?.toString() ?? "__filter_value_null__"),
                })),
              );
              changeFilterValue(newValues.map((item) => item.value));
            } else {
              changeFilterValue(setFn.map((item) => item.value));
            }
          }}
        />
      </div>
      {/* <Combobox
        items={valuesCombobox}
        value={filter.value}
        placeholder="Select value"
        onChange={changeFilter}
      /> */}
      {/* <Input
        value={filter.value}
        onChange={(e) => {
          dispatch(
            changeEvent({
              ...event,
              filters: event.filters.map((item) => {
                if (item.id === filter.id) {
                  return {
                    ...item,
                    value: e.currentTarget.value,
                  };
                }

                return item;
              }),
            }),
          );
        }}
      /> */}
    </div>
  );
}
