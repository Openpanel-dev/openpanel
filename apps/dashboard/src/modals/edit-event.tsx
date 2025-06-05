import {
  EventIconColors,
  EventIconMapper,
  EventIconRecords,
} from '@/components/events/event-icon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useAppParams } from '@/hooks/useAppParams';
import { api } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { useQueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { UndoIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Input } from '@/components/ui/input';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

interface Props {
  id: string;
}

export default function EditEvent({ id }: Props) {
  const { projectId } = useAppParams();
  const client = useQueryClient();

  const { data: event } = api.event.byId.useQuery({ id, projectId });

  const [selectedIcon, setIcon] = useState(EventIconRecords.default!.icon);
  const [selectedColor, setColor] = useState(EventIconRecords.default!.color);
  const [conversion, setConversion] = useState(false);
  const [step, setStep] = useState<'icon' | 'color'>('icon');
  useEffect(() => {
    if (event?.meta?.icon) {
      setIcon(event.meta.icon);
    }
    if (event?.meta?.color) {
      setColor(event.meta.color);
    }
    if (event?.meta?.conversion) {
      setConversion(event.meta.conversion);
    }
  }, [event]);

  const SelectedIcon = EventIconMapper[selectedIcon]!;

  const mutation = api.event.updateEventMeta.useMutation({
    onSuccess() {
      toast('Event updated');
      client.refetchQueries({
        queryKey: getQueryKey(api.event.events),
      });
      popModal();
    },
  });
  const getBg = (color: string) => `bg-${color}-200`;
  const getText = (color: string) => `text-${color}-700`;
  const iconGrid = 'grid grid-cols-10 gap-4';
  const [search, setSearch] = useState('');
  return (
    <ModalContent>
      <ModalHeader
        title={`Edit: ${event?.name}`}
        text={`Changes here will affect all "${event?.name}" events`}
        onClose={() => popModal()}
      />
      <div className="col gap-4">
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
        <AnimatePresence mode="wait">
          {step === 'icon' ? (
            <motion.div
              key="icon-step"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.15 }}
            >
              <Label className="mb-2 block">Pick an icon</Label>
              <Input
                className="mb-4"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search for an icon"
              />
              <div className={iconGrid}>
                {Object.entries(EventIconMapper)
                  .filter(([name]) =>
                    name.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map(([name, Icon]) => (
                    <button
                      type="button"
                      key={name}
                      onClick={() => {
                        setIcon(name);
                        setStep('color');
                      }}
                      className={cn(
                        'inline-flex h-8 w-8 flex-shrink-0 cursor-pointer items-center justify-center rounded-md bg-def-200 transition-all',
                        name === selectedIcon
                          ? 'scale-110 ring-1 ring-black'
                          : '[&_svg]:opacity-50',
                      )}
                    >
                      <Icon size={16} />
                    </button>
                  ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="color-step"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.15 }}
            >
              <div className="row mb-4 items-center justify-between">
                <div className="font-medium leading-none">Pick a color</div>
                <button type="button" onClick={() => setStep('icon')}>
                  <Badge variant="muted">
                    Select icon
                    <UndoIcon className="ml-1 h-3 w-3" />
                  </Badge>
                </button>
              </div>

              <div className={iconGrid}>
                {EventIconColors.map((color) => (
                  <button
                    type="button"
                    key={color}
                    onClick={() => {
                      setColor(color);
                    }}
                    className={cn(
                      'flex h-8 w-8 flex-shrink-0 cursor-pointer items-center justify-center rounded-md transition-all',
                      color === selectedColor ? 'ring-1 ring-black' : '',
                      getBg(color),
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
                        strokeWidth="2"
                      >
                        <circle cx="12.1" cy="12.1" r="4" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <Button
          className="mt-8 w-full"
          disabled={mutation.isLoading || !event}
          onClick={() =>
            mutation.mutate({
              projectId,
              name: event!.name,
              icon: selectedIcon,
              color: selectedColor,
              conversion,
            })
          }
        >
          Update event
        </Button>
      </div>
    </ModalContent>
  );
}
