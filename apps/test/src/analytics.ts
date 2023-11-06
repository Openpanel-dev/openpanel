import { MixanWeb } from '@mixan-test/sdk-web';

export const mixan = new MixanWeb({
  verbose: true,
  url: process.env.NEXT_PUBLIC_MIXAN_URL!,
  clientId: process.env.NEXT_PUBLIC_MIXAN_CLIENT_ID!,
  clientSecret: process.env.NEXT_PUBLIC_MIXAN_CLIENT_SECRET!,
  trackIp: true,
});

mixan.trackOutgoingLinks();
