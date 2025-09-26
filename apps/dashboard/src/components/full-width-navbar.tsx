'use client';

import { cn } from '@/utils/cn';

import { Logo, LogoSquare } from './logo';

type Props = {
  children: React.ReactNode;
  className?: string;
};

const FullWidthNavbar = ({ children, className }: Props) => {
  return (
    <div className={cn('border-b border-border bg-card', className)}>
      <div className="mx-auto flex h-14 w-full items-center justify-between px-4 md:w-[95vw] lg:w-[80vw] max-w-screen-2xl">
        <LogoSquare className="size-8" />
        {children}
      </div>
    </div>
  );
};

export default FullWidthNavbar;
