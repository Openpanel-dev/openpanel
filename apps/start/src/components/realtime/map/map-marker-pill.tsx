import type { DisplayMarker } from './map-types';
import { cn } from '@/lib/utils';

export function MapMarkerPill({
  marker,
  onClick,
}: {
  marker: DisplayMarker;
  onClick?: () => void;
}) {
  return (
    <button
      className={cn(
        'inline-flex select-none items-center gap-1.5 whitespace-nowrap rounded-lg border border-border/10 bg-background px-[10px] py-[5px] font-medium text-[11px] text-foreground shadow-[0_4px_16px] shadow-background/20',
        onClick ? 'cursor-pointer' : 'cursor-default'
      )}
      onClick={onClick}
      type="button"
    >
      <span className="relative flex size-[7px] shrink-0">
        <span className="absolute inset-0 animate-ping rounded-full bg-emerald-300 opacity-75" />
        <span className="relative inline-flex size-[7px] rounded-full bg-emerald-500" />
      </span>

      <span className="tabular-nums">{marker.count.toLocaleString()}</span>

      {marker.label ? (
        <>
          <span className="h-4 w-px shrink-0 bg-foreground/20" />
          <span className="max-w-[110px] truncate">{marker.label}</span>
        </>
      ) : null}
    </button>
  );
}
