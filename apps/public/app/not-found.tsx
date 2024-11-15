import { baseOptions } from '@/app/layout.config';
import { Footer } from '@/components/footer';
import { HeroContainer } from '@/components/hero';
import Navbar from '@/components/navbar';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import type { ReactNode } from 'react';

export default function NotFound({
  children,
}: {
  children: ReactNode;
}): React.ReactElement {
  return (
    <div>
      <Navbar />
      <HeroContainer className="h-screen center-center">
        <div className="relative z-10 col gap-2">
          <div className="text-[150px] font-mono font-bold opacity-5 -mb-4">
            404
          </div>
          <h1 className="text-6xl font-bold">Not Found</h1>
          <p className="text-xl text-muted-foreground">
            Awkward, we couldn&apos;t find what you were looking for.
          </p>
        </div>
      </HeroContainer>
      <Footer />
    </div>
  );
}
