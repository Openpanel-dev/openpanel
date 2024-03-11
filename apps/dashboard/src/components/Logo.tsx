import { cn } from '@/utils/cn';

interface LogoProps {
  className?: string;
}

export function LogoSquare({ className }: LogoProps) {
  return (
    <img
      src="/logo.svg"
      className={cn('rounded-md', className)}
      alt="Openpanel logo"
    />
  );
}

export function Logo({ className }: LogoProps) {
  return (
    <div
      className={cn('text-xl font-medium flex gap-2 items-center', className)}
    >
      <LogoSquare className="max-h-8" />
      openpanel.dev
    </div>
  );
}
