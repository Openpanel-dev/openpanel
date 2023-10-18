import { api } from "@/utils/api";
import { type IChartEvent } from "@/types";
import {
  CreditCard,
  SlidersHorizontal,
  Trash,
} from "lucide-react";
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
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";

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
  const propertiesQuery = api.chartMeta.properties.useQuery(
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
          <CommandInput placeholder="Type a command or search..." />
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
                            value: "",
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
  const dispatch = useDispatch();
  const potentialValues = api.chartMeta.values.useQuery({
    event: event.name,
    property: filter.name,
  });

  const valuesCombobox =
    potentialValues.data?.values?.map((item) => ({
      value: item,
      label: item,
    })) ?? [];

  const removeFilter = () => {
    dispatch(
      changeEvent({
        ...event,
        filters: event.filters.filter((item) => item.id !== filter.id),
      }),
    );
  };

  const changeFilter = (value: string) => {
    dispatch(
      changeEvent({
        ...event,
        filters: event.filters.map((item) => {
          if (item.id === filter.id) {
            return {
              ...item,
              value,
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
        <RenderDots className="text-sm flex-1">{filter.name}</RenderDots>
        <Button variant="ghost" size="sm" onClick={removeFilter}>
          <Trash size={16} />
        </Button>
      </div>
      {/* <ComboboxMulti items={valuesCombobox} selected={[]} setSelected={(fn) => {
        return fn(filter.value)
        //
      }} /> */}
      <Combobox
        items={valuesCombobox}
        value={filter.value}
        placeholder="Select value"
        onChange={changeFilter}
      />
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
