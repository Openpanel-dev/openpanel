import { Heading1, Lead2 } from './copy';
import { JoinWaitlistHero } from './join-waitlist-hero';
import { SocialProofServer } from './social-proof';

export function Hero() {
  return (
    <div className="relative overflow-hidden">
      {/* <div className="bg-blue-50 w-2/5 h-full absolute top-0 right-0"></div> */}
      <div className="container relative flex min-h-[700px] flex-col items-center gap-4 max-md:pt-32 md:h-screen md:flex-row md:gap-8">
        <div className="flex-1 max-md:text-center sm:min-w-[350px] lg:min-w-[400px]">
          <Heading1 className="mb-4 text-slate-950">
            An open-source
            <br />
            alternative to Mixpanel
          </Heading1>
          <Lead2 className="mb-12">
            The power of Mixpanel, the ease of Plausible and nothing from Google
            Analytics 😉
          </Lead2>
          <JoinWaitlistHero />
          <SocialProofServer className="mt-6" />
        </div>
        <div className="mt-16 w-full md:pt-16">
          <div className="flex h-[max(90vh,650px)] rounded-2xl bg-black/5 md:p-2">
            <iframe
              src="https://dashboard.openpanel.dev/share/overview/ZQsEhG"
              className="h-[max(90vh,650px)] h-full w-full rounded-xl"
              title="Openpanel Dashboard"
              scrolling="no"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
