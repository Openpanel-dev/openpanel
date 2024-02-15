import { Logo } from '@/components/Logo';
import Image from 'next/image';

import { db } from '@mixan/db';

import { PreviewCarousel } from './carousel';
import { Heading2, Lead2, Paragraph } from './copy';
import { Hero } from './hero';
import { JoinWaitlist } from './join-waitlist';
import { Sections } from './section';

export default async function Page() {
  const waitlistCount = await db.waitlist.count();
  return (
    <div>
      <Hero waitlistCount={waitlistCount} />
      <div className="bg-gradient-to-b from-blue-light to-[#FFFFFF] pb-16 text-center">
        <div className="relative -top-20">
          <PreviewCarousel />
        </div>
      </div>
      <div className="container">
        <div className="mb-24">
          <Heading2 className="md:text-5xl mb-2 leading-none">
            Analytics should be easy
            <br />
            and powerful
          </Heading2>
          <Lead2>
            The power of Mixpanel, the ease of Plausible and nothing from Google
            Analytics 😉
          </Lead2>
        </div>
        <Sections />
      </div>
      <div className="container mt-40">
        <div className="flex flex-col md:flex-row gap-8">
          <div className="mb-4 md:w-1/2 flex-shrink-0 relative">
            <Heading2>Another analytic tool? Really?</Heading2>
            {/* <SirenIcon
              strokeWidth={0.5}
              size={300}
              className="opacity-10 absolute -rotate-12 -left-20 -top-10"
            /> */}
          </div>
          <div className="flex flex-col gap-4 max-w-3xl">
            <h3 className="text-lg font-bold text-blue-dark">TL;DR</h3>
            <Paragraph>
              Our open-source analytic library fills a crucial gap by combining
              the strengths of Mixpanel's powerful features with Plausible's
              clear overview page. Motivated by the lack of an open-source
              alternative to Mixpanel and inspired by Plausible's simplicity, we
              aim to create an intuitive platform with predictable pricing. With
              a single-tier pricing model and limits only on monthly event
              counts, our goal is to democratize analytics, offering
              unrestricted access to all features while ensuring affordability
              and transparency for users of all project sizes.
            </Paragraph>

            <h3 className="text-lg font-bold text-blue-dark mt-12">The why</h3>
            <Paragraph>
              Our open-source analytic library emerged from a clear need within
              the analytics community. While platforms like Mixpanel offer
              powerful and user-friendly features, they lack a comprehensive
              overview page akin to Plausible's, which succinctly summarizes
              essential metrics. Recognizing this gap, we saw an opportunity to
              combine the strengths of both platforms while addressing their
              respective shortcomings.
            </Paragraph>

            <Paragraph>
              One significant motivation behind our endeavor was the absence of
              an open-source alternative to Mixpanel. We believe in the
              importance of accessibility and transparency in analytics, which
              led us to embark on creating a solution that anyone can freely use
              and contribute to.
            </Paragraph>

            <Paragraph>
              Inspired by Plausible's exemplary approach to simplicity and
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
              users can send each month. This approach, akin to Plausible's,
              ensures that users have the freedom to explore and utilize our
              platform to its fullest potential without arbitrary restrictions
              on reports or user counts. Ultimately, our goal is to democratize
              analytics by offering a reliable, transparent, and cost-effective
              solution for projects of all sizes.
            </Paragraph>
          </div>
        </div>
      </div>

      <footer className="bg-blue-darker text-white relative mt-40 relative">
        <div className="inset-0 absolute h-full w-full bg-[radial-gradient(circle,rgba(255,255,255,0.2)_0%,rgba(255,255,255,0)_100%)]"></div>
        <div className="relative container flex flex-col items-center text-center">
          <div className="my-24">
            <Heading2 className="text-white mb-2">Get early access</Heading2>
            <Lead2>
              Ready to set your analytics free? Get on our waitlist.
            </Lead2>

            <div className="mt-8">
              <JoinWaitlist className="text-white bg-white/20 border-white/30 focus:ring-white" />
            </div>
          </div>

          <div className="overflow-hidden rounded-xl">
            <div className="p-3 bg-white/20">
              <Image
                src="/demo/overview-min.png"
                width={1080}
                height={608}
                alt="Openpanel overview page"
                className="w-full rounded-lg"
              />
            </div>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0">
          <div className="h-px w-full bg-[radial-gradient(circle,rgba(255,255,255,0.7)_0%,rgba(255,255,255,0.7)_50%,rgba(255,255,255,0)_100%)]"></div>
          <div className="p-4 bg-blue-darker">
            <div className="container">
              <div className="flex justify-between items-center text-sm">
                <Logo />
                <a
                  className="hover:underline"
                  href="https://twitter.com/CarlLindesvard"
                  target="_blank"
                  rel="nofollow"
                >
                  Follow on X
                </a>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
