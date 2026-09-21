import { PlugIcon } from 'lucide-react';
import { IntegrationCard, IntegrationCardFooter } from './integration-card';
import { INTEGRATIONS } from './integrations';
import { Button } from '@/components/ui/button';
import { pushModal } from '@/modals';

export function AllIntegrations() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {INTEGRATIONS.map((integration) => (
        <IntegrationCard
          description={integration.description}
          icon={integration.icon}
          key={integration.name}
          name={integration.name}
        >
          <IntegrationCardFooter className="row justify-end">
            <Button
              onClick={() => {
                pushModal('AddIntegration', {
                  type: integration.type,
                });
              }}
              variant="outline"
            >
              <PlugIcon className="mr-2 size-4" />
              Connect
            </Button>
          </IntegrationCardFooter>
        </IntegrationCard>
      ))}
    </div>
  );
}
