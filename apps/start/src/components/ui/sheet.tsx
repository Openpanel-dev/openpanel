import * as SheetPrimitive from '@radix-ui/react-dialog';
import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';
import { XIcon } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/utils/cn';

const Sheet = SheetPrimitive.Root;

const SheetTrigger = SheetPrimitive.Trigger;

const SheetClose = SheetPrimitive.Close;

const SheetPortal = SheetPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/20 data-[state=closed]:animate-out data-[state=open]:animate-in',
      className
    )}
    {...props}
    ref={ref}
  />
));
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

const sheetVariants = cva(
  'fixed z-50 flex flex-col gap-4 overflow-y-auto rounded-xl bg-card p-6 shadow-2xl transition ease-in-out data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:duration-300 data-[state=open]:duration-500 max-sm:w-[calc(100%-theme(spacing.8))]',
  {
    variants: {
      side: {
        top: 'data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top inset-x-4 top-4 border',
        bottom:
          'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom inset-x-4 bottom-4 border',
        left: 'data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left top-4 bottom-4 left-4 w-3/4 border sm:max-w-sm',
        right:
          'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right top-4 right-4 bottom-4 w-3/4 border sm:max-w-sm',
      },
    },
    defaultVariants: {
      side: 'right',
    },
  }
);

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps & {
    onClose?: () => void;
  }
>(({ side = 'right', className, children, onClose, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay onClick={onClose} />
    <SheetPrimitive.Content
      className={cn(sheetVariants({ side }), className)}
      ref={ref}
      {...props}
    >
      {children}
      <SheetPrimitive.Close className="hidden" id="close-sheet" />
      <SheetPrimitive.Close
        className="absolute top-6 right-6 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-def-100"
        onClick={onClose}
      >
        <XIcon className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </SheetPrimitive.Close>
    </SheetPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = SheetPrimitive.Content.displayName;

const SheetHeader = ({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'sticky -top-6 z-10 -mx-6 -mt-6 mb-0 flex justify-between rounded-t-xl border-border border-b bg-card p-6 pb-5',
      className
    )}
    {...props}
  >
    <div className="row relative w-full items-start justify-between">
      {children}
    </div>
  </div>
);
SheetHeader.displayName = 'SheetHeader';

const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'sticky -bottom-6 z-10 -mx-6 mt-auto -mb-6 flex flex-col-reverse gap-2 rounded-b-xl border-border border-t bg-def-100 px-6 py-4 sm:flex-row sm:justify-end',
      className
    )}
    {...props}
  />
);
SheetFooter.displayName = 'SheetFooter';

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    className={cn('font-semibold text-foreground text-xl', className)}
    ref={ref}
    {...props}
  />
));
SheetTitle.displayName = SheetPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    className={cn('text-muted-foreground', className)}
    ref={ref}
    {...props}
  />
));
SheetDescription.displayName = SheetPrimitive.Description.displayName;

export function closeSheet() {
  if (typeof document === 'undefined') {
    return;
  }
  const element = document.querySelector('#close-sheet');
  if (element instanceof HTMLElement) {
    element.click();
  }
}

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
