import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { PaintBucketIcon, UndoIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';
import {
  EventIconColors,
  EventIconMapper,
  EventIconRecords,
} from '@/components/events/event-icon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppParams } from '@/hooks/use-app-params';
import { useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/utils/cn';

interface Props {
  id: string;
}

export default function EditEvent({ id }: Props) {
  const { projectId } = useAppParams();
  const trpc = useTRPC();
  const client = useQueryClient();

  const { data: event } = useQuery(
    trpc.event.byId.queryOptions({ id, projectId })
  );

  const [selectedIcon, setIcon] = useState<string | null>(null);
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

  const SelectedIcon = selectedIcon ? EventIconMapper[selectedIcon] : null;

  const mutation = useMutation(
    trpc.event.updateEventMeta.mutationOptions({
      onSuccess() {
        toast('Event updated');
        client.invalidateQueries(trpc.event.pathFilter());
        popModal();
      },
    })
  );
  const getBg = (color: string) => `bg-${color}-200`;
  const getText = (color: string) => `text-${color}-700`;
  const iconGrid = 'grid grid-cols-10 gap-4';
  const [search, setSearch] = useState('');
  return (
    <ModalContent>
      <ModalHeader
        text={`Changes here will affect all "${event?.name}" events`}
        title={`Edit: ${event?.name}`}
      />
      <div className="col gap-4">
        <div>
          <Label className="mb-4 block">Conversion</Label>
          <label className="flex cursor-pointer select-none items-center gap-4 rounded-md border border-border p-4">
            <Checkbox
              checked={conversion}
              onCheckedChange={(checked) => {
                if (checked === 'indeterminate') {
                  return;
                }
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
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              initial={{ opacity: 0, x: 20 }}
              key="icon-step"
              transition={{ duration: 0.15 }}
            >
              <div className="row mb-4 items-center justify-between">
                <div className="font-medium leading-none">Pick an icon</div>
                {
                  <button onClick={() => setStep('color')} type="button">
                    <Badge variant="outline">
                      Select color
                      <PaintBucketIcon className="ml-1 h-3 w-3" />
                    </Badge>
                  </button>
                }
              </div>
              <Input
                className="mb-4"
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search for an icon"
                value={search}
              />
              <div className={iconGrid}>
                {Object.entries(EventIconMapper)
                  .filter(([name]) =>
                    name.toLowerCase().includes(search.toLowerCase())
                  )
                  .map(([name, Icon]) => (
                    <button
                      className={cn(
                        'inline-flex h-8 w-8 flex-shrink-0 cursor-pointer items-center justify-center rounded-md bg-def-200 transition-all',
                        name === selectedIcon
                          ? 'scale-110 ring-1 ring-black'
                          : '[&_svg]:opacity-50'
                      )}
                      key={name}
                      onClick={() => {
                        setIcon(name);
                        setStep('color');
                      }}
                      type="button"
                    >
                      <Icon size={16} />
                    </button>
                  ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              initial={{ opacity: 0, x: 20 }}
              key="color-step"
              transition={{ duration: 0.15 }}
            >
              <div className="row mb-4 items-center justify-between">
                <div className="font-medium leading-none">Pick a color</div>
                <button onClick={() => setStep('icon')} type="button">
                  <Badge variant="outline">
                    Select icon
                    <UndoIcon className="ml-1 h-3 w-3" />
                  </Badge>
                </button>
              </div>

              <div className={iconGrid}>
                {EventIconColors.map((color) => (
                  <button
                    className={cn(
                      'flex h-8 w-8 flex-shrink-0 cursor-pointer items-center justify-center rounded-md transition-all',
                      color === selectedColor ? 'ring-1 ring-black' : '',
                      getBg(color)
                    )}
                    key={color}
                    onClick={() => {
                      setColor(color);
                    }}
                    type="button"
                  >
                    {SelectedIcon ? (
                      <SelectedIcon className={getText(color)} size={16} />
                    ) : (
                      <svg
                        className={`${getText(color)} opacity-70`}
                        fill="currentColor"
                        height="24"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                        width="24"
                        xmlns="http://www.w3.org/2000/svg"
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
          disabled={mutation.isPending || !event}
          onClick={() =>
            mutation.mutate({
              projectId,
              name: event!.name,
              icon: selectedIcon ?? EventIconRecords.default!.icon,
              color: selectedColor ?? EventIconRecords.default!.color,
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
