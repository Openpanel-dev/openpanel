import { useState } from 'react';
import { cn } from '@/utils/cn';
import { MenuIcon } from 'lucide-react';
import Link from 'next/link';

import { Container } from '../Container';
import { Breadcrumbs } from '../navbar/Breadcrumbs';
import { NavbarMenu } from '../navbar/NavbarMenu';

interface MainLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export function MainLayout({ children, className }: MainLayoutProps) {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <div className="h-2 w-full bg-gradient-to-r from-blue-900 to-purple-600"></div>
      <nav className="border-b border-border">
        <Container className="flex h-20 items-center justify-between ">
          <Link shallow href="/" className="text-3xl">
            mixan
          </Link>
          <div
            className={cn(
              'flex items-center gap-8 z-50',
              visible === false && 'max-sm:hidden',
              visible === true &&
                'max-sm:flex max-sm:flex-col max-sm:absolute max-sm:inset-0 max-sm:bg-white max-sm:justify-center max-sm:top-4 max-sm:shadow-lg'
            )}
          >
            <NavbarMenu />
          </div>
          <button
            className={cn(
              'px-4 sm:hidden absolute z-50 top-9 right-4 transition-all',
              visible === true && 'rotate-90'
            )}
            onClick={() => {
              setVisible((p) => !p);
            }}
          >
            <MenuIcon />
          </button>
        </Container>
      </nav>
      <Breadcrumbs />
      <main className={cn(className, 'mb-8')}>{children}</main>
    </>
  );
}
