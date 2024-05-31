'use client';

import { cn } from '@/utils/cn';
import { FullscreenIcon } from 'lucide-react';
import { parseAsBoolean, useQueryState } from 'nuqs';

import { Tooltiper } from './ui/tooltip';

type Props = {
  children: React.ReactNode;
  className?: string;
};

export const useFullscreen = () =>
  useQueryState(
    'fullscreen',
    parseAsBoolean.withDefault(false).withOptions({
      history: 'push',
      clearOnDefault: true,
    })
  );

export const Fullscreen = (props: Props) => {
  const [isFullscreen] = useFullscreen();
  return (
    <div
      className={cn(
        isFullscreen && 'bg-def-200 fixed inset-0 z-50 overflow-auto'
      )}
    >
      {props.children}
    </div>
  );
};

export const FullscreenToggle = () => {
  const [, setIsFullscreen] = useFullscreen();
  return (
    <Tooltiper content="Toggle fullscreen" asChild>
      <button
        className="flex items-center gap-2"
        onClick={() => {
          setIsFullscreen((p) => !p);
        }}
      >
        <FullscreenIcon />
        Realtime
      </button>
    </Tooltiper>
  );
};
