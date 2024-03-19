import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useState } from 'react';
import { api } from '@/app/_trpc/client';
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
import { cn } from '@/utils/cn';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import type { IServiceCreateEventPayload } from '@openpanel/db';

import {
  EventIconColors,
  EventIconMapper,
  EventIconRecords,
} from './event-icon';

interface Props {
  event: IServiceCreateEventPayload;
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
          <SheetTitle>Edit "{name}"</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-8 my-8">
          <div>
            <Label className="mb-4 block">Conversion</Label>
            <label className="cursor-pointer flex items-center select-none border border-border rounded-md p-4 gap-4">
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
                    'flex-shrink-0 rounded-md w-8 h-8 cursor-pointer inline-flex transition-all bg-slate-100 flex items-center justify-center',
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
                    'flex-shrink-0 rounded-md w-8 h-8 cursor-pointer transition-all flex justify-center items-center',
                    color === selectedColor ? 'ring-1 ring-black' : '',
                    getBg(color)
                  )}
                >
                  {SelectedIcon ? (
                    <SelectedIcon size={16} />
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
