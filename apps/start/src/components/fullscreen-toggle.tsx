import { bind } from 'bind-event-listener';
import { ChevronLeftIcon, FullscreenIcon } from 'lucide-react';
import { parseAsBoolean, useQueryState } from 'nuqs';
import { useEffect, useRef, useState } from 'react';
import { useDebounce } from 'usehooks-ts';
import { Button } from './ui/button';
import { Tooltiper } from './ui/tooltip';
import { cn } from '@/utils/cn';

type Props = {
  children: React.ReactNode;
  className?: string;
};

export const useFullscreen = () =>
  useQueryState(
    'fullscreen',
    parseAsBoolean.withDefault(false).withOptions({
      history: 'push',
    })
  );

export const Fullscreen = (props: Props) => {
  const [isFullscreen] = useFullscreen();
  return (
    <div
      className={cn(
        isFullscreen
          ? 'fixed inset-0 z-50 overflow-auto bg-def-200'
          : 'col min-h-full w-full'
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
    <Tooltiper asChild content="Toggle fullscreen">
      <Button
        onClick={() => {
          setIsFullscreen((p) => !p);
        }}
        size="icon"
        variant="outline"
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
    <div className="fixed top-0 bottom-0 z-50 flex items-center">
      <Tooltiper asChild content="Exit full screen">
        <button
          className={cn(
            'flex h-20 w-20 -translate-x-20 items-center justify-center rounded-full bg-foreground transition-transform',
            visible && isFullscreenDebounced && '-translate-x-10'
          )}
          onClick={() => {
            setIsFullscreen(false);
          }}
          ref={ref}
          type="button"
        >
          <ChevronLeftIcon className="ml-6 text-background" />
        </button>
      </Tooltiper>
    </div>
  );
};
