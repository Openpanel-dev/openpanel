import { ALink } from '@/components/ui/button';
import { ExternalLinkIcon } from 'lucide-react';

import { Heading2, Lead2, Paragraph } from './copy';
import { Features } from './features';
import { Hero } from './hero';
import { Pricing } from './pricing';
import { PunchLines } from './punch-lines';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

export default function Page() {
  return (
    <div>
      <Hero />
      <div className="bg-gradient-to-bl from-blue-600 to-blue-800 py-24">
        <div className="container">
          <Heading2 className="mb-2 leading-none text-white md:text-5xl">
            Analytics should be easy
            <br />
            and powerful
          </Heading2>
          <Lead2 className="text-white/80">
            The power of Mixpanel, the ease of Plausible and nothing from Google
            Analytics 😉 Curious how it looks?
          </Lead2>
          <ALink
            href="https://dashboard.openpanel.dev/share/overview/ZQsEhG"
            target="_blank"
            className="mt-8"
            variant={'outline'}
          >
            Check out the demo
            <ExternalLinkIcon className="ml-2 h-4 w-4" />
          </ALink>
        </div>
      </div>

      <Features />

      <PunchLines />

      <Pricing />

      <div className="container mt-40">
        <div className="flex flex-col gap-8 md:flex-row">
          <div className="relative mb-4 flex-shrink-0 md:w-1/2">
            <Heading2>Another analytic tool? Really?</Heading2>
            {/* <SirenIcon
              strokeWidth={0.5}
              size={300}
              className="opacity-10 absolute -rotate-12 -left-20 -top-10"
            /> */}
          </div>
          <div className="flex max-w-3xl flex-col gap-4">
            <h3 className="text-blue-dark text-lg font-bold">TL;DR</h3>
            <Paragraph>
              Our open-source analytic library fills a crucial gap by combining
              the strengths of Mixpanel&apos;s powerful features with
              Plausible&apos;s clear overview page. Motivated by the lack of an
              open-source alternative to Mixpanel and inspired by
              Plausible&apos;s simplicity, we aim to create an intuitive
              platform with predictable pricing. With a single-tier pricing
              model and limits only on monthly event counts, our goal is to
              democratize analytics, offering unrestricted access to all
              features while ensuring affordability and transparency for users
              of all project sizes.
            </Paragraph>

            <h3 className="text-blue-dark mt-12 text-lg font-bold">The why</h3>
            <Paragraph>
              Our open-source analytic library emerged from a clear need within
              the analytics community. While platforms like Mixpanel offer
              powerful and user-friendly features, they lack a comprehensive
              overview page akin to Plausible&apos;s, which succinctly
              summarizes essential metrics. Recognizing this gap, we saw an
              opportunity to combine the strengths of both platforms while
              addressing their respective shortcomings.
            </Paragraph>

            <Paragraph>
              One significant motivation behind our endeavor was the absence of
              an open-source alternative to Mixpanel. We believe in the
              importance of accessibility and transparency in analytics, which
              led us to embark on creating a solution that anyone can freely use
              and contribute to.
            </Paragraph>

            <Paragraph>
              Inspired by Plausible&apos;s exemplary approach to simplicity and
              clarity, we aim to build upon their foundation and further refine
              the user experience. By harnessing the best practices demonstrated
              by Plausible, we aspire to create an intuitive and streamlined
              analytics platform that empowers users to derive actionable
              insights effortlessly.
            </Paragraph>

            <Paragraph>
              Our own experiences with traditional analytics platforms like
              Mixpanel underscored another critical aspect driving our project:
              the need for predictable pricing. As project owners ourselves, we
              encountered the frustration of escalating costs as our user base
              grew. Therefore, we are committed to offering a single-tier
              pricing model that provides unlimited access to all features
              without the fear of unexpected expenses.
            </Paragraph>

            <Paragraph>
              In line with our commitment to fairness and accessibility, our
              pricing model will only impose limits on the number of events
              users can send each month. This approach, akin to
              Plausible&apos;s, ensures that users have the freedom to explore
              and utilize our platform to its fullest potential without
              arbitrary restrictions on reports or user counts. Ultimately, our
              goal is to democratize analytics by offering a reliable,
              transparent, and cost-effective solution for projects of all
              sizes.
            </Paragraph>
          </div>
        </div>
      </div>
    </div>
  );
}
