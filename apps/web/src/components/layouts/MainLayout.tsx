import Link from 'next/link';

import { Container } from '../Container';
import { NavbarMenu } from '../navbar/NavbarMenu';
import { NavbarUserDropdown } from '../navbar/NavbarUserDropdown';

interface MainLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export function MainLayout({ children, className }: MainLayoutProps) {
  return (
    <>
      <div className="h-2 w-full bg-gradient-to-r from-blue-900 to-purple-600"></div>
      <nav className="border-b border-border">
        <Container className="flex h-20 items-center justify-between ">
          <Link href="/" className="text-3xl">
            mixan
          </Link>
          <div className="flex items-center gap-8">
            <NavbarMenu />
            <div>
              <NavbarUserDropdown />
            </div>
          </div>
        </Container>
      </nav>
      <main className={className}>{children}</main>
    </>
  );
}
