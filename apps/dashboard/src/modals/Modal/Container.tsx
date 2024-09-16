'use client';

import { Button } from '@/components/ui/button';
import { DialogContent } from '@/components/ui/dialog';
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
        'relative -m-6 mb-6 flex justify-between rounded-t-lg border-b bg-def-100 p-6',
        className,
      )}
      style={{
        backgroundImage: `url("data:image/svg+xml,<svg id='patternId' width='100%' height='100%' xmlns='http://www.w3.org/2000/svg'><defs><pattern id='a' patternUnits='userSpaceOnUse' width='20' height='20' patternTransform='scale(2) rotate(85)'><rect x='0' y='0' width='100%' height='100%' fill='hsla(0, 0%, 100%, 0)'/><path d='M 10,-2.55e-7 V 20 Z M -1.1677362e-8,10 H 20 Z'  stroke-width='0.5' stroke='hsla(259, 0%, 52%, 0.46)' fill='none'/></pattern></defs><rect width='800%' height='800%' transform='translate(0,0)' fill='url(%23a)'/></svg>")`,
        backgroundSize: '100% 100%',
        backgroundRepeat: 'repeat',
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-def-100/95 to-def-100/80" />
      <div className="row relative w-full items-start justify-between">
        <div className="col mt-1 flex-1 gap-2">
          <div className="text-3xl font-semibold">{title}</div>
          {!!text && (
            <div className="text-lg text-muted-foreground">{text}</div>
          )}
        </div>
        {onClose !== false && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => (onClose ? onClose() : popModal())}
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Button>
        )}
      </div>
    </div>
  );
}
