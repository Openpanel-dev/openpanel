import type { RouterOutputs } from '@/trpc/client';
import {
  INTEGRATION_DESCRIPTORS,
  type IIntegrationType,
} from '@openpanel/validation';
import { BoxIcon, CloudIcon, DatabaseIcon, WebhookIcon } from 'lucide-react';
import { DiscordIntegrationForm } from './forms/discord-integration';
import { GCSExportIntegrationForm } from './forms/gcs-export-integration';
import { S3ExportIntegrationForm } from './forms/s3-export-integration';
import { SlackIntegrationForm } from './forms/slack-integration';
import { WebhookIntegrationForm } from './forms/webhook-integration';
import {
  IntegrationCardLogo,
  IntegrationCardLogoImage,
} from './integration-card';

type IntegrationFormComponent = React.ComponentType<{
  defaultValues?: RouterOutputs['integration']['get'];
  onSuccess: () => void;
}>;

interface IClientIntegration {
  type: IIntegrationType;
  // React-only bits that can't live in the validation/server registries.
  icon: React.ReactNode;
  // Omitted for pseudo-integrations (app/email) that aren't user-configured.
  Form?: IntegrationFormComponent;
}

const placeholderIcon = (
  <IntegrationCardLogo className="bg-def-200 text-foreground">
    <BoxIcon className="size-10" strokeWidth={1} />
  </IntegrationCardLogo>
);

/**
 * Client registry — the per-integration UI. Keyed by the same `type` literal as
 * the core (validation) and server (integrations) registries and forced to
 * cover every type via `satisfies Record<IIntegrationType, …>`, so a new
 * integration that forgets its UI entry is a compile error. Catalog strings
 * (name/description) come from the core descriptors, declared once.
 */
export const CLIENT_INTEGRATIONS: Record<IIntegrationType, IClientIntegration> =
  {
  slack: {
    type: 'slack',
    icon: (
      <IntegrationCardLogoImage
        src="https://play-lh.googleusercontent.com/mzJpTCsTW_FuR6YqOPaLHrSEVCSJuXzCljdxnCKhVZMcu6EESZBQTCHxMh8slVtnKqo"
        backgroundColor="#481449"
      />
    ),
    Form: SlackIntegrationForm,
  },
  discord: {
    type: 'discord',
    icon: (
      <IntegrationCardLogoImage
        src="https://static.vecteezy.com/system/resources/previews/006/892/625/non_2x/discord-logo-icon-editorial-free-vector.jpg"
        backgroundColor="#5864F2"
      />
    ),
    Form: DiscordIntegrationForm,
  },
  webhook: {
    type: 'webhook',
    icon: (
      <IntegrationCardLogo className="bg-foreground text-background">
        <WebhookIcon className="size-10" />
      </IntegrationCardLogo>
    ),
    Form: WebhookIntegrationForm,
  },
  app: { type: 'app', icon: placeholderIcon },
  email: { type: 'email', icon: placeholderIcon },
  s3_export: {
    type: 's3_export',
    icon: (
      <IntegrationCardLogo className="bg-[#FF9900] text-white">
        <CloudIcon className="size-10" />
      </IntegrationCardLogo>
    ),
    Form: S3ExportIntegrationForm,
  },
  gcs_export: {
    type: 'gcs_export',
    icon: (
      <IntegrationCardLogo className="bg-[#4285F4] text-white">
        <DatabaseIcon className="size-10" />
      </IntegrationCardLogo>
    ),
    Form: GCSExportIntegrationForm,
  },
  };

export interface IIntegrationCatalogEntry {
  type: IIntegrationType;
  name: string;
  description: string;
  icon: React.ReactNode;
}

/**
 * The "available integrations" catalog, derived from the core descriptors
 * (visible ones) joined with each integration's client icon.
 */
export const INTEGRATIONS: IIntegrationCatalogEntry[] =
  INTEGRATION_DESCRIPTORS.filter(
    (d) => !('hidden' in d.catalog && d.catalog.hidden),
  ).map((d) => ({
    type: d.type,
    name: d.catalog.name,
    description: d.catalog.description,
    icon: CLIENT_INTEGRATIONS[d.type].icon,
  }));
