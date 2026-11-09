import { ArrowDownIcon, ArrowUpIcon, LayoutGridIcon } from 'lucide-react';
import {
  getWidgetPlacement,
  placeWidget,
  REALTIME_WIDGET_IDS,
  type RealtimeLayout,
  type RealtimePlacement,
  type RealtimeWidgetId,
  shiftWidget,
} from './live-layout';
import { REALTIME_WIDGETS } from './live-widgets';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

const PLACEMENTS: Array<{ value: RealtimePlacement; label: string }> = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'hidden', label: 'Off' },
];

interface LiveCustomizeProps {
  layout: RealtimeLayout;
  onChange: (layout: RealtimeLayout) => void;
  onReset: () => void;
}

export function LiveCustomize({
  layout,
  onChange,
  onReset,
}: LiveCustomizeProps) {
  const hiddenIds = REALTIME_WIDGET_IDS.filter(
    (id) => getWidgetPlacement(layout, id) === 'hidden'
  );
  const orderedIds = [...layout.left, ...layout.right, ...hiddenIds];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          className="bg-card/85 backdrop-blur-md"
          icon={LayoutGridIcon}
          variant="outline"
        >
          Customize
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[26rem] p-0" portal>
        <ul className="flex flex-col divide-y">
          {orderedIds.map((id) => (
            <WidgetRow id={id} key={id} layout={layout} onChange={onChange} />
          ))}
        </ul>
        <div className="flex items-center justify-between gap-2 border-t p-3">
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={layout.showIsland}
              onCheckedChange={(showIsland) =>
                onChange({ ...layout, showIsland })
              }
            />
            Top referrers and countries
          </label>
          <Button onClick={onReset} size="sm" variant="ghost">
            Reset
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function WidgetRow({
  id,
  layout,
  onChange,
}: {
  id: RealtimeWidgetId;
  layout: RealtimeLayout;
  onChange: (layout: RealtimeLayout) => void;
}) {
  const { label, description } = REALTIME_WIDGETS[id];
  const placement = getWidgetPlacement(layout, id);
  const column = placement === 'hidden' ? [] : layout[placement];
  const index = column.indexOf(id);

  return (
    <li className="flex items-center gap-2 p-3">
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-sm">{label}</div>
        <div className="truncate text-muted-foreground text-xs">
          {description}
        </div>
      </div>
      <Button
        aria-label={`Move ${label} up`}
        disabled={index <= 0}
        icon={ArrowUpIcon}
        onClick={() => onChange(shiftWidget(layout, id, -1))}
        size="icon"
        variant="ghost"
      />
      <Button
        aria-label={`Move ${label} down`}
        disabled={index < 0 || index === column.length - 1}
        icon={ArrowDownIcon}
        onClick={() => onChange(shiftWidget(layout, id, 1))}
        size="icon"
        variant="ghost"
      />
      <ToggleGroup
        aria-label={`Where to show ${label}`}
        onValueChange={(value: RealtimePlacement | '') => {
          if (value) {
            onChange(placeWidget(layout, id, value));
          }
        }}
        type="single"
        value={placement}
      >
        {PLACEMENTS.map((option) => (
          <ToggleGroupItem
            className="h-8 px-2 text-xs"
            key={option.value}
            value={option.value}
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </li>
  );
}
