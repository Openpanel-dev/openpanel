'use client';

import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

import { popModal } from '..';

interface ModalContentProps {
  children: React.ReactNode;
}

export function ModalContent({ children }: ModalContentProps) {
  return (
    <div className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] border bg-background p-6 shadow-lg duration-200  sm:rounded-lg md:w-full">
      {children}
    </div>
  );
}

interface ModalHeaderProps {
  title: string | React.ReactNode;
  onClose?: (() => void) | false;
}

export function ModalHeader({ title, onClose }: ModalHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="font-medium">{title}</div>
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
