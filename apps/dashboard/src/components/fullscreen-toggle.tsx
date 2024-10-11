'use client';

import { cn } from '@/utils/cn';
import { bind } from 'bind-event-listener';
import { ChevronLeftIcon, FullscreenIcon } from 'lucide-react';
import { parseAsBoolean, useQueryState } from 'nuqs';
import { useEffect, useRef, useState } from 'react';
import { useDebounce } from 'usehooks-ts';

import { Button } from './ui/button';
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
    }),
  );

export const Fullscreen = (props: Props) => {
  const [isFullscreen] = useFullscreen();
  return (
    <div
      className={cn(
        isFullscreen && 'fixed inset-0 z-50 overflow-auto bg-def-200',
      )}
    >
      {props.children}
    </div>
  );
};

export const FullscreenOpen = () => {
  const [fullscreen, setIsFullscreen] = useFullscreen();
  if (fullscreen) {
    return null;
  }
  return (
    <Tooltiper content="Toggle fullscreen" asChild>
      <Button
        variant="outline"
        size="icon"
        onClick={() => {
          setIsFullscreen((p) => !p);
        }}
      >
        <FullscreenIcon className="size-4" />
      </Button>
    </Tooltiper>
  );
};

export const FullscreenClose = () => {
  const [fullscreen, setIsFullscreen] = useFullscreen();
  const isFullscreenDebounced = useDebounce(fullscreen, 1000);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let timer: any;
    const unsub = bind(window, {
      type: 'mousemove',
      listener(ev) {
        if (fullscreen) {
          setVisible(true);
          clearTimeout(timer);
          timer = setTimeout(() => {
            if (!ref.current?.contains(ev.target as Node)) {
              setVisible(false);
            }
          }, 500);
        }
      },
    });
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, [fullscreen]);

  if (!fullscreen) {
    return null;
  }

  return (
    <div className="fixed bottom-0 top-0 z-50 flex items-center">
      <Tooltiper content="Exit full screen" asChild>
        <button
          type="button"
          ref={ref}
          className={cn(
            'flex h-20 w-20 -translate-x-20 items-center justify-center rounded-full bg-foreground transition-transform',
            visible && isFullscreenDebounced && '-translate-x-10',
          )}
          onClick={() => {
            setIsFullscreen(false);
          }}
        >
          <ChevronLeftIcon className="ml-6 text-background" />
        </button>
      </Tooltiper>
    </div>
  );
};
