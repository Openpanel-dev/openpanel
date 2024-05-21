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
      className={cn(
        'fixed left-0 right-0 top-0 z-10 z-50 flex h-20 items-center border-b border-border bg-white',
        textColor,
        className
      )}
    >
      <div className="container flex items-center justify-between py-4">
        <Logo className="max-sm:[&_span]:hidden" />
        <nav className="flex gap-4 text-sm">
          {pathname !== '/' && <Link href="/">Home</Link>}
          <Link href="/#pricing" data-event="click_pricing">
            Pricing
          </Link>
          <a href="https://docs.openpanel.dev" target="_blank">
            Docs
          </a>
          <a href="https://git.new/openpanel" target="_blank">
            Github
          </a>
          <a href="https://dashboard.openpanel.dev" target="_blank">
            Sign in
          </a>
        </nav>
      </div>
    </div>
  );
}
