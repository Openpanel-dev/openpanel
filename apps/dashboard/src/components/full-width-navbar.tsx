'use client';

import { cn } from '@/utils/cn';

import { Logo } from './logo';

type Props = {
  children: React.ReactNode;
  className?: string;
};

const FullWidthNavbar = ({ children, className }: Props) => {
  return (
    <div className={cn('border-b border-border bg-background', className)}>
      <div className="mx-auto flex h-14 w-full items-center justify-between px-4 md:max-w-[95vw] lg:max-w-[80vw]">
        <Logo />
        {children}
      </div>
    </div>
  );
};

export default FullWidthNavbar;
