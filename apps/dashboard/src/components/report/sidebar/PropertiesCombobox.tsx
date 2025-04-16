import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useAppParams } from '@/hooks/useAppParams';
import { useEventProperties } from '@/hooks/useEventProperties';
import type { IChartEvent } from '@openpanel/validation';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeftIcon, DatabaseIcon, UserIcon } from 'lucide-react';
import VirtualList from 'rc-virtual-list';
import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';

interface PropertiesComboboxProps {
  event?: IChartEvent;
  children: (setOpen: Dispatch<SetStateAction<boolean>>) => React.ReactNode;
  onSelect: (action: {
    value: string;
    label: string;
    description: string;
  }) => void;
}

function SearchHeader({
  onBack,
  onSearch,
  value,
}: {
  onBack?: () => void;
  onSearch: (value: string) => void;
  value: string;
}) {
  return (
    <div className="row items-center gap-1">
      {!!onBack && (
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeftIcon className="size-4" />
        </Button>
      )}
      <Input
        placeholder="Search"
        value={value}
        onChange={(e) => onSearch(e.target.value)}
        autoFocus
      />
    </div>
  );
}

export function PropertiesCombobox({
  event,
  children,
  onSelect,
}: PropertiesComboboxProps) {
  const { projectId } = useAppParams();
  const [open, setOpen] = useState(false);
  const properties = useEventProperties({
    event: event?.name,
    projectId,
  });
  const [state, setState] = useState<'index' | 'event' | 'profile'>('index');
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');

  useEffect(() => {
    if (!open) {
      setState('index');
    }
  }, [open]);

  // Mock data for the lists
  const profileActions = properties
    .filter((property) => property.startsWith('profile'))
    .map((property) => ({
      value: property,
      label: property.split('.').pop() ?? property,
      description: property.split('.').slice(0, -1).join('.'),
    }));
  const eventActions = properties
    .filter((property) => !property.startsWith('profile'))
    .map((property) => ({
      value: property,
      label: property.split('.').pop() ?? property,
      description: property.split('.').slice(0, -1).join('.'),
    }));

  const handleStateChange = (newState: 'index' | 'event' | 'profile') => {
    setDirection(newState === 'index' ? 'backward' : 'forward');
    setState(newState);
  };

  const handleSelect = (action: {
    value: string;
    label: string;
    description: string;
  }) => {
    setOpen(false);
    onSelect(action);
  };

  const renderIndex = () => {
    return (
      <DropdownMenuGroup>
        {/* <SearchHeader onSearch={() => {}} value={search} /> */}
        {/* <DropdownMenuSeparator /> */}
        <DropdownMenuItem
          className="group justify-between"
          onClick={(e) => {
            e.preventDefault();
            handleStateChange('event');
          }}
        >
          Event properties
          <DatabaseIcon className="size-4 group-hover:text-blue-500 group-hover:scale-125 transition-all group-hover:rotate-12" />
        </DropdownMenuItem>
        <DropdownMenuItem
          className="group justify-between"
          onClick={(e) => {
            e.preventDefault();
            handleStateChange('profile');
          }}
        >
          Profile properties
          <UserIcon className="size-4 group-hover:text-blue-500 group-hover:scale-125 transition-all group-hover:rotate-12" />
        </DropdownMenuItem>
      </DropdownMenuGroup>
    );
  };

  const renderEvent = () => {
    const filteredActions = eventActions.filter(
      (action) =>
        action.label.toLowerCase().includes(search.toLowerCase()) ||
        action.description.toLowerCase().includes(search.toLowerCase()),
    );

    return (
      <div className="col">
        <SearchHeader
          onBack={() => handleStateChange('index')}
          onSearch={setSearch}
          value={search}
        />
        <DropdownMenuSeparator />
        <VirtualList
          height={300}
          data={filteredActions}
          itemHeight={40}
          itemKey="id"
        >
          {(action) => (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-2 hover:bg-accent cursor-pointer rounded-md col gap-px"
              onClick={() => handleSelect(action)}
            >
              <div className="font-medium">{action.label}</div>
              <div className="text-sm text-muted-foreground">
                {action.description}
              </div>
            </motion.div>
          )}
        </VirtualList>
      </div>
    );
  };

  const renderProfile = () => {
    const filteredActions = profileActions.filter(
      (action) =>
        action.label.toLowerCase().includes(search.toLowerCase()) ||
        action.description.toLowerCase().includes(search.toLowerCase()),
    );

    return (
      <div className="flex flex-col">
        <SearchHeader
          onBack={() => handleStateChange('index')}
          onSearch={setSearch}
          value={search}
        />
        <DropdownMenuSeparator />
        <VirtualList
          height={300}
          data={filteredActions}
          itemHeight={40}
          itemKey="id"
        >
          {(action) => (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-2 hover:bg-accent cursor-pointer rounded-md col gap-px"
              onClick={() => handleSelect(action)}
            >
              <div className="font-medium">{action.label}</div>
              <div className="text-sm text-muted-foreground">
                {action.description}
              </div>
            </motion.div>
          )}
        </VirtualList>
      </div>
    );
  };

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(open) => {
        setOpen(open);
      }}
    >
      <DropdownMenuTrigger asChild>{children(setOpen)}</DropdownMenuTrigger>
      <DropdownMenuContent className="max-w-80" align="start">
        <AnimatePresence mode="wait" initial={false}>
          {state === 'index' && (
            <motion.div
              key="index"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.05 }}
            >
              {renderIndex()}
            </motion.div>
          )}
          {state === 'event' && (
            <motion.div
              key="event"
              initial={{ opacity: 0, x: direction === 'forward' ? 20 : -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction === 'forward' ? -20 : 20 }}
              transition={{ duration: 0.05 }}
            >
              {renderEvent()}
            </motion.div>
          )}
          {state === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, x: direction === 'forward' ? 20 : -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction === 'forward' ? -20 : 20 }}
              transition={{ duration: 0.05 }}
            >
              {renderProfile()}
            </motion.div>
          )}
        </AnimatePresence>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
