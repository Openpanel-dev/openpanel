import { Footer } from '@/components/footer';
import { Hero } from '@/components/hero';
import Navbar from '@/components/navbar';
import { Faq } from '@/components/sections/faq';
import { Features } from '@/components/sections/features';
import { Pricing } from '@/components/sections/pricing';
import { Sdks } from '@/components/sections/sdks';
import { Stats, StatsPure } from '@/components/sections/stats';
import { Testimonials } from '@/components/sections/testimonials';
import type { Metadata } from 'next';
import { Suspense } from 'react';

export const metadata: Metadata = {
  title: 'An open-source alternative to Mixpanel',
};

export const experimental_ppr = true;

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Features />
        <Testimonials />
        <Suspense
          fallback={
            <StatsPure
              projectCount={882}
              eventCount={634_000_000}
              last24hCount={7_000_000}
            />
          }
        >
          <Stats />
        </Suspense>
        <Faq />
        <Pricing />
        <Sdks />
      </main>
      <Footer />
    </>
  );
}
