import { useCurrentTime, useReplayContext } from '@/components/sessions/replay/replay-context';
import { Button } from '@/components/ui/button';
import { Pause, Play } from 'lucide-react';
import { formatDuration } from './replay-utils';

export function ReplayTime() {
  const { duration } = useReplayContext();
  const currentTime = useCurrentTime(250);

  return (
    <span className="text-sm tabular-nums text-muted-foreground font-mono">
      {formatDuration(currentTime)} / {formatDuration(duration)}
    </span>
  );
}

export function ReplayPlayPauseButton() {
  const { isPlaying, isReady, toggle } = useReplayContext();

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
