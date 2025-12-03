import { Footer } from '@/components/footer';
import Navbar from '@/components/navbar';
import type { ReactNode } from 'react';

export default function Layout({
  children,
}: {
  children: ReactNode;
}): React.ReactElement {
  return (
    <>
      <Navbar />
      <main>{children}</main>
      <Footer />
    </>
  );
}
