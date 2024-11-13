import { Hero } from '@/components/hero';
import { Faq } from '@/components/sections/faq';
import { Features } from '@/components/sections/features';
import { Pricing } from '@/components/sections/pricing';
import { Sdks } from '@/components/sections/sdks';
import { Stats } from '@/components/sections/stats';
import { Testimonials } from '@/components/sections/testimonials';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'An open-source alternative to Mixpanel',
};

export const revalidate = 3600;

export default function HomePage() {
  return (
    <main>
      <Hero />
      <Features />
      <Testimonials />
      <Stats />
      <Faq />
      <Pricing />
      <Sdks />
    </main>
  );
}
