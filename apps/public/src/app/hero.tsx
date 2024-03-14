import { Tooltip, TooltipContent } from '@/components/ui/tooltip';
import { TooltipTrigger } from '@radix-ui/react-tooltip';
import Image from 'next/image';

import { PreviewCarousel } from './carousel';
import { Heading1, Lead2 } from './copy';
import { JoinWaitlistHero } from './join-waitlist-hero';
import { SocialProofServer } from './social-proof';
import { SocialProof } from './social-proof/social-proof';

const avatars = [
  'https://api.dicebear.com/7.x/adventurer/svg?seed=Chester&backgroundColor=b6e3f4',
  'https://api.dicebear.com/7.x/adventurer/svg?seed=Casper&backgroundColor=c0aede',
  'https://api.dicebear.com/7.x/adventurer/svg?seed=Boo&backgroundColor=ffdfbf',
];

export function Hero() {
  return (
    <div className="flex py-32 flex-col items-center w-full text-center bg-[#1F54FF] relative overflow-hidden">
      {/* <div className="inset-0 absolute h-full w-full bg-[radial-gradient(circle,rgba(255,255,255,0.1)_0%,rgba(255,255,255,0)_100%)]"></div> */}
      <div className="inset-0 absolute h-full w-full flex items-center justify-center">
        <div className="w-[600px] h-[600px] ring-1 ring-white/05 rounded-full shrink-0"></div>
      </div>
      <div className="inset-0 absolute h-full w-full flex items-center justify-center">
        <div className="w-[900px] h-[900px] ring-1 ring-white/10 rounded-full shrink-0"></div>
      </div>
      <div className="inset-0 absolute h-full w-full flex items-center justify-center">
        <div className="w-[1200px] h-[1200px] ring-1 ring-white/20 rounded-full shrink-0"></div>
      </div>
      <div className="relative flex flex-col items-center max-w-3xl">
        <Image
          width={64}
          height={64}
          src="/logo-white.png"
          alt="Openpanel Logo"
          className="w-16 h-16 mb-8"
        />
        <Heading1 className="mb-4 text-white">
          An open-source
          <br />
          alternative to Mixpanel
        </Heading1>
        <Lead2 className="text-white/70 font-light">
          The power of Mixpanel, the ease of Plausible <br />
          and nothing from Google Analytics 😉
        </Lead2>
        <div className="my-12 w-full flex flex-col items-center">
          <JoinWaitlistHero />
          <SocialProofServer className="mt-6" />
        </div>
      </div>

      <PreviewCarousel />
    </div>
  );
}
