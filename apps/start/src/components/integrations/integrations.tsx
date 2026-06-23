import type { IIntegrationConfig } from '@openpanel/validation';
import { WebhookIcon } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IntegrationCardLogo,
  IntegrationCardLogoImage,
} from './integration-card';

export type IntegrationDefinition = {
  type: IIntegrationConfig['type'];
  name: string;
  description: string;
  icon: React.ReactNode;
};

export function useIntegrations(): IntegrationDefinition[] {
  const { t } = useTranslation();

  return useMemo(
    () => [
      {
        type: 'slack',
        name: t('integrations.slack_name'),
        description: t('integrations.slack_description'),
        icon: (
          <IntegrationCardLogoImage
            src="https://play-lh.googleusercontent.com/mzJpTCsTW_FuR6YqOPaLHrSEVCSJuXzCljdxnCKhVZMcu6EESZBQTCHxMh8slVtnKqo"
            backgroundColor="#481449"
            alt={t('integrations.slack_logo_alt')}
          />
        ),
      },
      {
        type: 'discord',
        name: t('integrations.discord_name'),
        description: t('integrations.discord_description'),
        icon: (
          <IntegrationCardLogoImage
            src="https://static.vecteezy.com/system/resources/previews/006/892/625/non_2x/discord-logo-icon-editorial-free-vector.jpg"
            backgroundColor="#5864F2"
            alt={t('integrations.discord_logo_alt')}
          />
        ),
      },
      {
        type: 'webhook',
        name: t('integrations.webhook_name'),
        description: t('integrations.webhook_description'),
        icon: (
          <IntegrationCardLogo className="bg-foreground text-background">
            <WebhookIcon className="size-10" />
          </IntegrationCardLogo>
        ),
      },
    ],
    [t],
  );
}
