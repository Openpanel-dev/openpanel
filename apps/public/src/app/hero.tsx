import { Heading1, Lead2 } from './copy';
import { JoinWaitlistHero } from './join-waitlist-hero';
import { SocialProofServer } from './social-proof';

export function Hero() {
  return (
    <div className="relative overflow-hidden">
      {/* <div className="bg-blue-50 w-2/5 h-full absolute top-0 right-0"></div> */}
      <div className="container md:h-screen min-h-[700px] flex flex-col md:flex-row items-center relative max-md:pt-32 gap-4 md:gap-8">
        <div className="flex-1 lg:min-w-[400px] sm:min-w-[350px] max-md:text-center">
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
        <div className="mt-16 md:pt-16 w-full">
          <div className="bg-black/5 md:p-2 rounded-2xl h-[max(90vh,650px)] flex">
            <iframe
              src="https://dashboard.openpanel.dev/share/overview/ZQsEhG"
              className="w-full h-full rounded-xl h-[max(90vh,650px)]"
              title="Openpanel Dashboard"
              scrolling="no"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
