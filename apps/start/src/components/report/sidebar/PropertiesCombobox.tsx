import type { IChartEvent } from '@openpanel/validation';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeftIcon,
  Building2Icon,
  DatabaseIcon,
  TargetIcon,
  UserIcon,
} from 'lucide-react';
import VirtualList from 'rc-virtual-list';
import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';
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
import { useAppParams } from '@/hooks/use-app-params';
import { useCohorts } from '@/hooks/use-cohorts';
import { useEventProperties } from '@/hooks/use-event-properties';
import { useTRPC } from '@/integrations/trpc/react';

export type PropertiesComboboxAction = {
  value: string;
  label: string;
  description: string;
  cohortId?: string;
};

interface PropertiesComboboxProps {
  event?: IChartEvent;
  children: (setOpen: Dispatch<SetStateAction<boolean>>) => React.ReactNode;
  onSelect: (action: PropertiesComboboxAction) => void;
  exclude?: string[];
  include?: string[];
  mode?: 'events' | 'profile';
  showCohorts?: boolean;
  isBreakdown?: boolean;
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
        <Button onClick={onBack} size="icon" variant="ghost">
          <ArrowLeftIcon className="size-4" />
        </Button>
      )}
      <Input
        autoFocus
        onChange={(e) => onSearch(e.target.value)}
        placeholder="Search"
        value={value}
      />
    </div>
  );
}

export function PropertiesCombobox({
  event,
  children,
  onSelect,
  mode,
  exclude = [],
  include = [],
  showCohorts = false,
  isBreakdown = false,
}: PropertiesComboboxProps) {
  const { projectId } = useAppParams();
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const properties = useEventProperties({
    event: event?.name,
    projectId,
  });
  const groupPropertiesQuery = useQuery(
    trpc.group.properties.queryOptions({ projectId })
  );
  const cohorts = useCohorts(
    { projectId, includeCount: false },
    { enabled: showCohorts },
  );
  const [state, setState] = useState<
    'index' | 'event' | 'profile' | 'group' | 'cohort'
  >('index');
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');

  useEffect(() => {
    if (!open) {
      setState(mode ? (mode === 'events' ? 'event' : 'profile') : 'index');
    }
  }, [open, mode]);

  const matchesPropertyPattern = (property: string, pattern: string) => {
    if (pattern.endsWith('*')) {
      return property.startsWith(pattern.slice(0, -1));
    }
    return property === pattern;
  };

  const shouldShowProperty = (property: string) => {
    return !exclude.some((pattern) => matchesPropertyPattern(property, pattern));
  };

  const allProperties = Array.from(new Set([...properties, ...include]));

  // Fixed group properties: name, type, plus dynamic property keys
  const groupActions = [
    { value: 'group.name', label: 'name', description: 'group' },
    { value: 'group.type', label: 'type', description: 'group' },
    ...(groupPropertiesQuery.data ?? []).map((key) => ({
      value: `group.properties.${key}`,
      label: key,
      description: 'group.properties',
    })),
  ].filter((a) => shouldShowProperty(a.value));

  const profileActions = allProperties
    .filter(
      (property) =>
        property.startsWith('profile') && shouldShowProperty(property)
    )
    .map((property) => ({
      value: property,
      label: property.split('.').pop() ?? property,
      description: property.split('.').slice(0, -1).join('.'),
    }));
  const eventActions = allProperties
    .filter(
      (property) =>
        !property.startsWith('profile') && shouldShowProperty(property)
    )
    .map((property) => ({
      value: property,
      label: property.split('.').pop() ?? property,
      description: property.split('.').slice(0, -1).join('.'),
    }));

  const handleStateChange = (
    newState: 'index' | 'event' | 'profile' | 'group' | 'cohort'
  ) => {
    setDirection(newState === 'index' ? 'backward' : 'forward');
    setState(newState);
  };

  const handleSelect = (action: PropertiesComboboxAction) => {
    setOpen(false);
    onSelect(action);
  };

  const cohortActions: PropertiesComboboxAction[] = cohorts.map((cohort) => ({
    value: `cohort:${cohort.id}`,
    label: cohort.name,
    description: cohort.description
      ? cohort.description
      : `${cohort.profileCount ?? 0} members`,
    cohortId: cohort.id,
  }));

  const renderIndex = () => {
    return (
      <DropdownMenuGroup>
        {/* <SearchHeader onSearch={() => {}} value={search} /> */}
        {/* <DropdownMenuSeparator /> */}
        <DropdownMenuItem
          className="group justify-between gap-2"
          onClick={(e) => {
            e.preventDefault();
            handleStateChange('event');
          }}
        >
          Event properties
          <DatabaseIcon className="size-4 transition-all group-hover:rotate-12 group-hover:scale-125 group-hover:text-blue-500" />
        </DropdownMenuItem>
        <DropdownMenuItem
          className="group justify-between gap-2"
          onClick={(e) => {
            e.preventDefault();
            handleStateChange('profile');
          }}
        >
          Profile properties
          <UserIcon className="size-4 transition-all group-hover:rotate-12 group-hover:scale-125 group-hover:text-blue-500" />
        </DropdownMenuItem>
        <DropdownMenuItem
          className="group justify-between gap-2"
          onClick={(e) => {
            e.preventDefault();
            handleStateChange('group');
          }}
        >
          Group properties
          <Building2Icon className="size-4 transition-all group-hover:rotate-12 group-hover:scale-125 group-hover:text-blue-500" />
        </DropdownMenuItem>
        {showCohorts && (
          <DropdownMenuItem
            className="group justify-between gap-2"
            onClick={(e) => {
              e.preventDefault();
              if (isBreakdown) {
                handleSelect({
                  value: 'cohort',
                  label: 'Cohorts',
                  description: 'All cohorts',
                });
              } else {
                handleStateChange('cohort');
              }
            }}
          >
            Cohorts
            <TargetIcon className="size-4 transition-all group-hover:rotate-12 group-hover:scale-125 group-hover:text-blue-500" />
          </DropdownMenuItem>
        )}
      </DropdownMenuGroup>
    );
  };

  const renderCohort = () => {
    const filteredActions = cohortActions.filter(
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
          data={filteredActions}
          height={Math.min(300, filteredActions.length * 40 + 8)}
          itemHeight={40}
          itemKey="value"
        >
          {(action) => (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="col cursor-pointer gap-px rounded-md p-2 hover:bg-accent"
              initial={{ opacity: 0, y: 10 }}
              onClick={() => handleSelect(action)}
            >
              <div className="font-medium">{action.label}</div>
              <div className="text-muted-foreground text-sm">
                {action.description}
              </div>
            </motion.div>
          )}
        </VirtualList>
      </div>
    );
  };

  const renderEvent = () => {
    const filteredActions = eventActions.filter(
      (action) =>
        action.label.toLowerCase().includes(search.toLowerCase()) ||
        action.description.toLowerCase().includes(search.toLowerCase())
    );

    return (
      <div className="col">
        <SearchHeader
          onBack={
            mode === undefined ? () => handleStateChange('index') : undefined
          }
          onSearch={setSearch}
          value={search}
        />
        <DropdownMenuSeparator />
        <VirtualList
          data={filteredActions}
          height={300}
          itemHeight={40}
          itemKey="id"
        >
          {(action) => (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="col cursor-pointer gap-px rounded-md p-2 hover:bg-accent"
              initial={{ opacity: 0, y: 10 }}
              onClick={() => handleSelect(action)}
            >
              <div className="font-medium">{action.label}</div>
              <div className="text-muted-foreground text-sm">
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
        action.description.toLowerCase().includes(search.toLowerCase())
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
          data={filteredActions}
          height={300}
          itemHeight={40}
          itemKey="id"
        >
          {(action) => (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="col cursor-pointer gap-px rounded-md p-2 hover:bg-accent"
              initial={{ opacity: 0, y: 10 }}
              onClick={() => handleSelect(action)}
            >
              <div className="font-medium">{action.label}</div>
              <div className="text-muted-foreground text-sm">
                {action.description}
              </div>
            </motion.div>
          )}
        </VirtualList>
      </div>
    );
  };

  const renderGroup = () => {
    const filteredActions = groupActions.filter(
      (action) =>
        action.label.toLowerCase().includes(search.toLowerCase()) ||
        action.description.toLowerCase().includes(search.toLowerCase())
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
          data={filteredActions}
          height={Math.min(300, filteredActions.length * 40 + 8)}
          itemHeight={40}
          itemKey="value"
        >
          {(action) => (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="col cursor-pointer gap-px rounded-md p-2 hover:bg-accent"
              initial={{ opacity: 0, y: 10 }}
              onClick={() => handleSelect(action)}
            >
              <div className="font-medium">{action.label}</div>
              <div className="text-muted-foreground text-sm">
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
      onOpenChange={(open) => {
        setOpen(open);
      }}
      open={open}
    >
      <DropdownMenuTrigger asChild>{children(setOpen)}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-w-80">
        <AnimatePresence initial={false} mode="wait">
          {state === 'index' && (
            <motion.div
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              key="index"
              transition={{ duration: 0.05 }}
            >
              {renderIndex()}
            </motion.div>
          )}
          {state === 'event' && (
            <motion.div
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction === 'forward' ? -20 : 20 }}
              initial={{ opacity: 0, x: direction === 'forward' ? 20 : -20 }}
              key="event"
              transition={{ duration: 0.05 }}
            >
              {renderEvent()}
            </motion.div>
          )}
          {state === 'profile' && (
            <motion.div
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction === 'forward' ? -20 : 20 }}
              initial={{ opacity: 0, x: direction === 'forward' ? 20 : -20 }}
              key="profile"
              transition={{ duration: 0.05 }}
            >
              {renderProfile()}
            </motion.div>
          )}
          {state === 'group' && (
            <motion.div
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction === 'forward' ? -20 : 20 }}
              initial={{ opacity: 0, x: direction === 'forward' ? 20 : -20 }}
              key="group"
              transition={{ duration: 0.05 }}
            >
              {renderGroup()}
            </motion.div>
          )}
          {state === 'cohort' && (
            <motion.div
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction === 'forward' ? -20 : 20 }}
              initial={{ opacity: 0, x: direction === 'forward' ? 20 : -20 }}
              key="cohort"
              transition={{ duration: 0.05 }}
            >
              {renderCohort()}
            </motion.div>
          )}
        </AnimatePresence>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
