'use client';

import { Button } from '@/components/ui/button';
import { DialogContent } from '@/components/ui/dialog';
import { X } from 'lucide-react';

import { popModal } from '..';

interface ModalContentProps {
  children: React.ReactNode;
  className?: string;
}

export function ModalContent({ children, className }: ModalContentProps) {
  return <DialogContent className={className}>{children}</DialogContent>;
}

interface ModalHeaderProps {
  title: string | React.ReactNode;
  text?: string | React.ReactNode;
  onClose?: (() => void) | false;
}

export function ModalHeader({ title, text, onClose }: ModalHeaderProps) {
  return (
    <div className="mb-6 flex justify-between">
      <div>
        <div className="mt-0.5 font-medium">{title}</div>
        {!!text && <div className="text-sm text-muted-foreground">{text}</div>}
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
  );
}
