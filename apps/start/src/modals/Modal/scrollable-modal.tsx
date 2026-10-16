import { createContext, useContext, useRef } from 'react';
import { ModalContent } from './Container';
import { VirtualScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/utils/cn';

const ScrollableModalContext = createContext<{
  scrollAreaRef: React.RefObject<HTMLDivElement | null>;
}>({
  scrollAreaRef: { current: null },
});

export function useScrollableModal() {
  return useContext(ScrollableModalContext);
}

export function ScrollableModal({
  header,
  footer,
  children,
}: {
  header: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  return (
    <ScrollableModalContext.Provider value={{ scrollAreaRef }}>
      <ModalContent className="!max-h-[90vh] flex flex-col gap-0 p-0">
        <div className="flex-shrink-0 p-6">{header}</div>
        <VirtualScrollArea
          className={cn(
            'min-h-0 w-full flex-1',
            footer && 'border-b',
            header && 'border-t'
          )}
          ref={scrollAreaRef}
        >
          {children}
        </VirtualScrollArea>
        {footer && <div className="flex-shrink-0 p-6">{footer}</div>}
      </ModalContent>
    </ScrollableModalContext.Provider>
  );
}
