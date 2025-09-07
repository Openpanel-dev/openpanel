import { Button } from '@/components/ui/button';
import { DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/utils/cn';
import type { DialogContentProps } from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { popModal } from '..';

interface ModalContentProps extends DialogContentProps {
  children: React.ReactNode;
}

export function ModalContent({ children, ...props }: ModalContentProps) {
  return <DialogContent {...props}>{children}</DialogContent>;
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
        className,
      )}
      style={{}}
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
            variant="ghost"
            size="sm"
            onClick={() => (onClose ? onClose() : popModal())}
            className="-mt-2"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Button>
        )}
      </div>
    </div>
  );
}
