import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { api } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import type { IServiceEvent } from '@openpanel/db';

import {
  EventIconColors,
  EventIconMapper,
  EventIconRecords,
} from './event-icon';

interface Props {
  event: IServiceEvent;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
}

export function EventEdit({ event, open, setOpen }: Props) {
  const router = useRouter();

  const { name, meta, projectId } = event;

  const [selectedIcon, setIcon] = useState(
    meta?.icon ??
      EventIconRecords[name]?.icon ??
      EventIconRecords.default?.icon ??
      ''
  );
  const [selectedColor, setColor] = useState(
    meta?.color ??
      EventIconRecords[name]?.color ??
      EventIconRecords.default?.color ??
      ''
  );
  const [conversion, setConversion] = useState(!!meta?.conversion);

  useEffect(() => {
    if (meta?.icon) {
      setIcon(meta.icon);
    }
  }, [meta?.icon]);
  useEffect(() => {
    if (meta?.color) {
      setColor(meta.color);
    }
  }, [meta?.color]);
  useEffect(() => {
    setConversion(meta?.conversion ?? false);
  }, [meta?.conversion]);

  const SelectedIcon = EventIconMapper[selectedIcon]!;

  const mutation = api.event.updateEventMeta.useMutation({
    onSuccess() {
      setOpen(false);
      toast('Event updated');
      router.refresh();
    },
  });
  const getBg = (color: string) => `bg-${color}-200`;
  const getText = (color: string) => `text-${color}-700`;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit &quot;{name}&quot;</SheetTitle>
        </SheetHeader>
        <div className="my-8 flex flex-col gap-8">
          <div>
            <Label className="mb-4 block">Conversion</Label>
            <label className="flex cursor-pointer select-none items-center gap-4 rounded-md border border-border p-4">
              <Checkbox
                checked={conversion}
                onCheckedChange={(checked) => {
                  if (checked === 'indeterminate') return;
                  setConversion(checked);
                }}
              />
              <div>
                <span>Yes, this event is important!</span>
              </div>
            </label>
          </div>
          <div>
            <Label className="mb-4 block">Pick a icon</Label>
            <div className="flex flex-wrap gap-4">
              {Object.entries(EventIconMapper).map(([name, Icon]) => (
                <button
                  key={name}
                  onClick={() => {
                    setIcon(name);
                  }}
                  className={cn(
                    'inline-flex h-8 w-8 flex-shrink-0 cursor-pointer items-center justify-center rounded-md bg-def-200 transition-all',
                    name === selectedIcon
                      ? 'scale-110 ring-1 ring-black'
                      : '[&_svg]:opacity-50'
                  )}
                >
                  <Icon size={16} />
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="mb-4 block">Pick a color</Label>
            <div className="flex flex-wrap gap-4">
              {EventIconColors.map((color) => (
                <button
                  key={color}
                  onClick={() => {
                    setColor(color);
                  }}
                  className={cn(
                    'flex h-8 w-8 flex-shrink-0 cursor-pointer items-center justify-center rounded-md transition-all',
                    color === selectedColor ? 'ring-1 ring-black' : '',
                    getBg(color)
                  )}
                >
                  {SelectedIcon ? (
                    <SelectedIcon size={16} className={getText(color)} />
                  ) : (
                    <svg
                      className={`${getText(color)} opacity-70`}
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <circle cx="12.1" cy="12.1" r="4" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        <SheetFooter>
          <Button
            className="w-full"
            onClick={() =>
              mutation.mutate({
                projectId,
                name,
                icon: selectedIcon,
                color: selectedColor,
                conversion,
              })
            }
          >
            Update event
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
