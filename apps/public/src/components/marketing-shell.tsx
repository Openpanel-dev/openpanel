import type { ReactNode } from 'react';
import { Footer } from '@/components/footer';
import Navbar from '@/components/navbar';
import { cn } from '@/lib/utils';

// Marketing pages are always light; the docs keep the user's theme.
export function MarketingShell({
  children,
  mainClassName,
}: {
  children: ReactNode;
  mainClassName?: string;
}) {
  return (
    <div className="light col min-h-screen bg-background text-foreground">
      <Navbar />
      <main className={cn('flex-1', mainClassName)}>{children}</main>
      <Footer />
    </div>
  );
}
