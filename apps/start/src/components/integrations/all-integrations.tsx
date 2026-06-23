import { Button } from '@/components/ui/button';
import { pushModal } from '@/modals';
import { PlugIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IntegrationCard, IntegrationCardFooter } from './integration-card';
import { useIntegrations } from './integrations';

export function AllIntegrations() {
  const { t } = useTranslation();
  const integrations = useIntegrations();

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {integrations.map((integration) => (
        <IntegrationCard
          key={integration.name}
          icon={integration.icon}
          name={integration.name}
          description={integration.description}
        >
          <IntegrationCardFooter className="row justify-end">
            <Button
              variant="outline"
              onClick={() => {
                pushModal('AddIntegration', {
                  type: integration.type,
                });
              }}
            >
              <PlugIcon className="size-4 mr-2" />
              {t('integrations.action_connect')}
            </Button>
          </IntegrationCardFooter>
        </IntegrationCard>
      ))}
    </div>
  );
}
