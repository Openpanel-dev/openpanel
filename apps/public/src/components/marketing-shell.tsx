import type { ReactNode } from 'react';
import { Footer } from '@/components/footer';
import Navbar from '@/components/navbar';
import { cn } from '@/lib/utils';

export function MarketingShell({
  children,
  mainClassName,
}: {
  children: ReactNode;
  mainClassName?: string;
}) {
  return (
    <div className="col min-h-screen bg-canvas text-foreground">
      <Navbar />
      <main className={cn('flex-1', mainClassName)}>{children}</main>
      <Footer />
    </div>
  );
}
