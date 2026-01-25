import type { IIntegrationConfig } from '@openpanel/validation';
import { CloudIcon, DatabaseIcon, WebhookIcon } from 'lucide-react';
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
  {
    type: 's3_export',
    name: 'S3 Export',
    description:
      'Export events to Amazon S3 for loading into Redshift, Snowflake, Athena, or other data warehouses.',
    icon: (
      <IntegrationCardLogo className="bg-[#FF9900] text-white">
        <CloudIcon className="size-10" />
      </IntegrationCardLogo>
    ),
  },
  {
    type: 'gcs_export',
    name: 'GCS Export',
    description:
      'Export events to Google Cloud Storage for loading into BigQuery or other data warehouses.',
    icon: (
      <IntegrationCardLogo className="bg-[#4285F4] text-white">
        <DatabaseIcon className="size-10" />
      </IntegrationCardLogo>
    ),
  },
];
