'use client';

import { Button } from '@/components/ui/button';
import { pushModal } from '@/modals';
import { PlugIcon, WebhookIcon } from 'lucide-react';
import { IntegrationCard, IntegrationCardFooter } from './integration-card';
import { INTEGRATIONS } from './integrations';

export function AllIntegrations() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {INTEGRATIONS.map((integration) => (
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
              Connect
            </Button>
          </IntegrationCardFooter>
        </IntegrationCard>
      ))}
    </div>
  );
}
