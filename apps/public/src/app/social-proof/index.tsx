import { TooltipProvider } from '@/components/ui/tooltip';

import { db } from '@openpanel/db';

import { SocialProof } from './social-proof';

interface Props {
  className?: string;
}
export async function SocialProofServer(props: Props) {
  const waitlistCount = await db.waitlist.count();
  return (
    <TooltipProvider>
      <SocialProof count={waitlistCount} {...props} />;
    </TooltipProvider>
  );
}
