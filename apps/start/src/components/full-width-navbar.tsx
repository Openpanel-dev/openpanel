import { LogoSquare } from './logo';
import { cn } from '@/utils/cn';

type Props = {
  children: React.ReactNode;
  className?: string;
};

const FullWidthNavbar = ({ children, className }: Props) => {
  return (
    <div className={cn('border-border border-b bg-card', className)}>
      <div className="mx-auto flex h-14 w-full max-w-screen-2xl items-center justify-between px-4 md:w-[95vw] lg:w-[80vw]">
        <LogoSquare className="size-8" />
        {children}
      </div>
    </div>
  );
};

export default FullWidthNavbar;
