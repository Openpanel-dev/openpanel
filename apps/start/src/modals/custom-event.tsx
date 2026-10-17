import type { IServiceCustomEvent } from '@openpanel/core';
import type { ICustomEventItem } from '@openpanel/core/modules/report/report.constants';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { XIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';
import { ButtonContainer } from '@/components/button-container';
import { FiltersBuilder } from '@/components/filters/FiltersBuilder';
import { InputWithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { ComboboxEvents } from '@/components/ui/combobox-events';
import { Label } from '@/components/ui/label';
import { useAppParams } from '@/hooks/use-app-params';
import { useEventNames } from '@/hooks/use-event-names';
import { handleError, useTRPC } from '@/integrations/trpc/react';

interface CustomEventProps {
  customEvent?: Pick<IServiceCustomEvent, 'id' | 'name' | 'items'>;
}

export default function CustomEvent({ customEvent }: CustomEventProps = {}) {
  const { projectId } = useAppParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const eventNames = useEventNames({ projectId, anyEvents: false });
  const [name, setName] = useState(customEvent?.name ?? '');
  const [items, setItems] = useState<ICustomEventItem[]>(
    customEvent?.items ?? []
  );

  const onSuccess = () => {
    toast('Custom event saved');
    queryClient.invalidateQueries(trpc.customEvent.list.pathFilter());
    queryClient.invalidateQueries(trpc.chart.pathFilter());
    popModal();
  };
  const create = useMutation(
    trpc.customEvent.create.mutationOptions({ onSuccess, onError: handleError })
  );
  const update = useMutation(
    trpc.customEvent.update.mutationOptions({ onSuccess, onError: handleError })
  );

  const selectedNames = items.map((item) => item.name);
  const setSelectedNames = (names: string[]) => {
    setItems(
      names.map(
        (eventName) =>
          items.find((item) => item.name === eventName) ?? {
            name: eventName,
            filters: [],
          }
      )
    );
  };
  const setItemFilters = (
    index: number,
    filters: ICustomEventItem['filters']
  ) => {
    setItems(
      items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, filters } : item
      )
    );
  };

  const isValid = name.trim().length > 0 && items.length > 0;
  const isPending = create.isPending || update.isPending;

  return (
    <ModalContent>
      <ModalHeader
        text="Matches when any of the events below happens. Use it in reports like any other event."
        title={customEvent ? 'Edit custom event' : 'Create custom event'}
      />
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const input = { projectId, name, items };
          if (customEvent) {
            update.mutate({ ...input, id: customEvent.id });
          } else {
            create.mutate(input);
          }
        }}
      >
        <InputWithLabel
          label="Name"
          onChange={(event) => setName(event.target.value)}
          placeholder="eg. Used navigation"
          value={name}
        />
        <div className="col gap-2">
          <Label>Events</Label>
          <ComboboxEvents
            items={eventNames}
            multiple
            onChange={setSelectedNames}
            placeholder="Select events"
            searchable
            value={selectedNames}
          />
          {items.map((item, index) => (
            <div className="rounded-lg border bg-def-100 p-2" key={item.name}>
              <div className="row items-center justify-between gap-2">
                <span className="truncate font-medium">{item.name}</span>
                <Button
                  aria-label={`Remove ${item.name}`}
                  icon={XIcon}
                  onClick={() =>
                    setSelectedNames(
                      selectedNames.filter(
                        (eventName) => eventName !== item.name
                      )
                    )
                  }
                  size="icon"
                  type="button"
                  variant="ghost"
                />
              </div>
              <FiltersBuilder
                addLabel="Narrow with filter"
                categories={['event']}
                eventName={item.name}
                onChange={(filters) => setItemFilters(index, filters)}
                value={item.filters}
              />
            </div>
          ))}
        </div>
        <ButtonContainer>
          <Button onClick={() => popModal()} type="button" variant="outline">
            Cancel
          </Button>
          <Button disabled={!isValid} loading={isPending} type="submit">
            Save
          </Button>
        </ButtonContainer>
      </form>
    </ModalContent>
  );
}
