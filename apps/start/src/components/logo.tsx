import { cn } from '@/utils/cn';

interface LogoProps {
  className?: string;
}

export function LogoSquare({ className }: LogoProps) {
  return (
    <img
      alt="Openpanel logo"
      className={cn('rounded-md', className)}
      src="/logo.svg"
    />
  );
}

export function Logo({ className }: LogoProps) {
  return (
    <div
      className={cn('flex items-center gap-2 font-medium text-xl', className)}
    >
      <LogoSquare className="max-h-8" />
      <span>openpanel.dev</span>
    </div>
  );
}
