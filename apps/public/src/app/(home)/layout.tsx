import type { ReactNode } from 'react';
import { Footer } from '@/components/footer';
import Navbar from '@/components/navbar';

export default function Layout({
  children,
}: {
  children: ReactNode;
}): React.ReactElement {
  return (
    <>
      <Navbar />
      <main className="overflow-hidden">{children}</main>
      <Footer />
    </>
  );
}
