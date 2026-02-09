'use client';

import {
  SPEED_OPTIONS,
  useReplayContext,
} from '@/components/sessions/replay/replay-context';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Pause, Play, SkipBack, SkipForward } from 'lucide-react';

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function ReplayTime() {
  const { currentTime, duration } = useReplayContext();

  return (
    <span className="text-sm tabular-nums text-muted-foreground font-mono">
      {formatTime(currentTime)} / {formatTime(duration)}
    </span>
  );
}

export function ReplayPlayPauseButton() {
  const { isPlaying, isReady, toggle, seek } = useReplayContext();

  if (!isReady) return null;

  return (
    <Button
      type="button"
      variant={isPlaying ? 'outline' : 'default'}
      size="icon"
      onClick={toggle}
      aria-label={isPlaying ? 'Pause' : 'Play'}
    >
      {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
    </Button>
  );
}

//  {/* <DropdownMenu>
//         <DropdownMenuTrigger asChild>
//           <Button variant="outline" size="sm" className="h-8 gap-1">
//             {speed}x
//             <ChevronDown className="h-3.5 w-3.5" />
//           </Button>
//         </DropdownMenuTrigger>
//         <DropdownMenuContent align="end">
//           {SPEED_OPTIONS.map((s) => (
//             <DropdownMenuItem
//               key={s}
//               onClick={() => setSpeed(s)}
//               className={speed === s ? 'bg-accent' : ''}
//             >
//               {s}x
//             </DropdownMenuItem>
//           ))}
//         </DropdownMenuContent>
//       </DropdownMenu> */}
