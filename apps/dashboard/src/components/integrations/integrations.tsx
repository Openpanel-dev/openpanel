import type { IIntegrationConfig } from '@openpanel/db';
import { WebhookIcon } from 'lucide-react';
import {
  IntegrationCardLogo,
  IntegrationCardLogoImage,
} from './integration-card';

export const INTEGRATIONS: {
  type: IIntegrationConfig['type'];
  name: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    type: 'slack',
    name: 'Slack',
    description:
      'Connect your Slack workspace to get notified when new issues are created.',
    icon: (
      <IntegrationCardLogoImage
        src="https://play-lh.googleusercontent.com/mzJpTCsTW_FuR6YqOPaLHrSEVCSJuXzCljdxnCKhVZMcu6EESZBQTCHxMh8slVtnKqo"
        backgroundColor="#481449"
      />
    ),
  },
  {
    type: 'discord',
    name: 'Discord',
    description:
      'Connect your Discord server to get notified when new issues are created.',
    icon: (
      <IntegrationCardLogoImage
        src="https://static.vecteezy.com/system/resources/previews/006/892/625/non_2x/discord-logo-icon-editorial-free-vector.jpg"
        backgroundColor="#5864F2"
      />
    ),
  },
  {
    type: 'webhook',
    name: 'Webhook',
    description:
      'Create a webhook to take actions in your own systems when new events are created.',
    icon: (
      <IntegrationCardLogo className="bg-foreground text-background">
        <WebhookIcon className="size-10" />
      </IntegrationCardLogo>
    ),
  },
];
