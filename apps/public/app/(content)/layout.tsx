import { Footer } from '@/components/footer';
import { HeroContainer } from '@/components/hero';
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
      <main className="overflow-hidden">
        <HeroContainer className="h-screen pointer-events-none" />
        <div className="absolute h-screen inset-0 radial-gradient-dot-pages select-none pointer-events-none" />
        <div className="-mt-[calc(100vh-100px)] relative min-h-[500px] pb-12 -mb-24">
          {children}
        </div>
      </main>
      <Footer />
    </>
  );
}
