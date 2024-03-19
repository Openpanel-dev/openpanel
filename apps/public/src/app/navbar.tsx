'use client';

import { Logo } from '@/components/Logo';
import { cn } from '@/utils/cn';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Props {
  darkText?: boolean;
  className?: string;
}

export function Navbar({ darkText = false, className }: Props) {
  const pathname = usePathname();
  const textColor = darkText ? 'text-blue-dark' : 'text-white';
  return (
    <div
      className={cn('absolute top-0 left-0 right-0 z-10', textColor, className)}
    >
      <div className="container flex justify-between items-center py-4">
        <Logo className="max-sm:[&_span]:hidden" />
        <nav className="flex gap-4">
          {pathname !== '/' && <Link href="/">Home</Link>}
          <a href="https://docs.openpanel.dev" target="_blank">
            Docs
          </a>
          <a href="https://dashboard.openpanel.dev" target="_blank">
            Sign in
          </a>
        </nav>
      </div>
    </div>
  );
}
