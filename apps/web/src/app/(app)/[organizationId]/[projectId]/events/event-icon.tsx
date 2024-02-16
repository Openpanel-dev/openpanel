import { useEffect, useState } from 'react';
import { api } from '@/app/_trpc/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/utils/cn';
import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';
import { ActivityIcon, BotIcon, DotIcon, MonitorPlayIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import type { EventMeta } from '@mixan/db';

const variants = cva('flex items-center justify-center shrink-0', {
  variants: {
    size: {
      sm: 'w-6 h-6 rounded',
      default: 'w-12 h-12 rounded-xl',
    },
  },
  defaultVariants: {
    size: 'default',
  },
});

type EventIconProps = VariantProps<typeof variants> & {
  name: string;
  meta?: EventMeta;
  projectId: string;
  className?: string;
};

const records: Record<
  string,
  {
    icon: string;
    color: string;
  }
> = {
  default: {
    icon: 'BotIcon',
    color: 'slate',
  },
  screen_view: {
    icon: 'MonitorPlayIcon',
    color: 'blue',
  },
  session_start: {
    icon: 'ActivityIcon',
    color: 'teal',
  },
};

const icons: Record<string, LucideIcon> = {
  BotIcon,
  MonitorPlayIcon,
  ActivityIcon,
};

const colors = [
  'rose',
  'pink',
  'fuchsia',
  'purple',
  'violet',
  'indigo',
  'blue',
  'sky',
  'cyan',
  'teal',
  'emerald',
  'green',
  'lime',
  'yellow',
  'amber',
  'orange',
  'red',
  'stone',
  'neutral',
  'zinc',
  'grey',
  'slate',
];

export function EventIcon({
  className,
  name,
  size,
  meta,
  projectId,
}: EventIconProps) {
  const router = useRouter();
  const [selectedIcon, setIcon] = useState(
    meta?.icon ?? records[name]?.icon ?? records.default?.icon ?? ''
  );
  const [selectedColor, setColor] = useState(
    meta?.color ?? records[name]?.color ?? records.default?.color ?? ''
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

  const SelectedIcon = icons[selectedIcon]!;
  const Icon =
    icons[meta?.icon ?? records[name]?.icon ?? records.default?.icon ?? '']!;
  const color =
    meta?.color ?? records[name]?.color ?? records.default?.color ?? '';

  const mutation = api.event.updateEventMeta.useMutation({
    onSuccess() {
      document.querySelector('#close-sheet')?.click();
      toast('Event updated');
      router.refresh();
    },
  });
  const getBg = (color: string) => `bg-${color}-200`;
  const getText = (color: string) => `text-${color}-700`;

  return (
    <Sheet>
      <SheetTrigger className={cn(getBg(color), variants({ size }), className)}>
        <Icon size={20} className={getText(color)} />
      </SheetTrigger>
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
              {Object.entries(icons).map(([name, Icon]) => (
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
              {colors.map((color) => (
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
