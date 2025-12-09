import { ScrollArea, VirtualScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/utils/cn';
import { createContext, useContext, useRef } from 'react';
import { ModalContent } from './Container';

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
      <ModalContent className="flex !max-h-[90vh] flex-col p-0 gap-0">
        <div className="flex-shrink-0 p-6">{header}</div>
        <VirtualScrollArea
          ref={scrollAreaRef}
          className={cn(
            'flex-1 min-h-0 w-full',
            footer && 'border-b',
            header && 'border-t',
          )}
        >
          {children}
        </VirtualScrollArea>
        {footer && <div className="flex-shrink-0 p-6">{footer}</div>}
      </ModalContent>
    </ScrollableModalContext.Provider>
  );
}
