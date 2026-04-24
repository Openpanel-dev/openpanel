import type { DialogContentProps } from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useRef } from 'react';
import { popModal } from '..';
import { Button } from '@/components/ui/button';
import { DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/utils/cn';

interface ModalContentProps extends DialogContentProps {
  children: React.ReactNode;
}

export function ModalContent({ children, ...props }: ModalContentProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  return (
    <DialogContent
      {...props}
      onPointerDownOutside={(e) => {
        if (!contentRef.current) {
          return;
        }
        const contentRect = contentRef.current.getBoundingClientRect();
        // Detect if click actually happened within the bounds of content.
        // This can happen if click was on an absolutely positioned element overlapping content,
        // such as the 1password extension icon in the text input.
        const actuallyClickedInside =
          e.detail.originalEvent.clientX > contentRect.left &&
          e.detail.originalEvent.clientX <
            contentRect.left + contentRect.width &&
          e.detail.originalEvent.clientY > contentRect.top &&
          e.detail.originalEvent.clientY < contentRect.top + contentRect.height;

        if (actuallyClickedInside) {
          e.preventDefault();
        }

        // Best for shadow DOM/web components (1Password uses this)
        const path = e.detail.originalEvent.composedPath();
        const clicked1Password = path.some(
          (node) =>
            node instanceof Element &&
            node.tagName.toLowerCase() === 'com-1password-button'
        );
        if (clicked1Password) {
          e.preventDefault();
          return;
        }
      }}
      ref={contentRef}
    >
      {children}
    </DialogContent>
  );
}

interface ModalHeaderProps {
  title: string | React.ReactNode;
  text?: string | React.ReactNode;
  onClose?: (() => void) | false;
  className?: string;
}

export function ModalHeader({
  title,
  text,
  onClose,
  className,
}: ModalHeaderProps) {
  return (
    <div
      className={cn(
        'relative -m-6 mb-4 flex justify-between rounded-t-lg p-6 pb-0',
        className
      )}
    >
      <div className="row relative w-full justify-between gap-4">
        <div className="col flex-1 gap-2">
          <DialogTitle>{title}</DialogTitle>
          {!!text && (
            <div className="text-lg text-muted-foreground leading-normal">
              {text}
            </div>
          )}
        </div>
        {onClose !== false && (
          <Button
            className="-mt-2"
            onClick={() => (onClose ? onClose() : popModal())}
            size="sm"
            variant="ghost"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Button>
        )}
      </div>
    </div>
  );
}
