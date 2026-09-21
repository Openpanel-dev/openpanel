import { Pause, Play } from 'lucide-react';
import { formatDuration } from './replay-utils';
import {
  useCurrentTime,
  useReplayContext,
} from '@/components/sessions/replay/replay-context';
import { Button } from '@/components/ui/button';

export function ReplayTime() {
  const { duration } = useReplayContext();
  const currentTime = useCurrentTime(250);

  return (
    <span className="font-mono text-muted-foreground text-sm tabular-nums">
      {formatDuration(currentTime)} / {formatDuration(duration)}
    </span>
  );
}

export function ReplayPlayPauseButton() {
  const { isPlaying, isReady, toggle } = useReplayContext();

  if (!isReady) {
    return null;
  }

  return (
    <Button
      aria-label={isPlaying ? 'Pause' : 'Play'}
      onClick={toggle}
      size="icon"
      type="button"
      variant={isPlaying ? 'outline' : 'default'}
    >
      {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
    </Button>
  );
}
