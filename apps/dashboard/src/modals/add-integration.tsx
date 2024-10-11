'use client';

import { api } from '@/trpc/client';

import { DiscordIntegrationForm } from '@/components/integrations/forms/discord-integration';
import { SlackIntegrationForm } from '@/components/integrations/forms/slack-integration';
import { WebhookIntegrationForm } from '@/components/integrations/forms/webhook-integration';
import { IntegrationCardContent } from '@/components/integrations/integration-card';
import { INTEGRATIONS } from '@/components/integrations/integrations';
import { SheetContent } from '@/components/ui/sheet';
import type { IIntegrationConfig } from '@openpanel/validation';
import { useQueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { useQueryState } from 'nuqs';
import { toast } from 'sonner';
import { popModal } from '.';
import { ModalHeader } from './Modal/Container';

interface Props {
  id?: string;
  type: IIntegrationConfig['type'];
}
export default function AddIntegration(props: Props) {
  const query = api.integration.get.useQuery(
    {
      id: props.id ?? '',
    },
    {
      enabled: !!props.id,
    },
  );

  const integration = INTEGRATIONS.find((i) => i.type === props.type);

  const renderCard = () => {
    if (!integration) {
      return null;
    }
    return (
      <div className="card bg-def-100">
        <IntegrationCardContent {...integration} />
      </div>
    );
  };

  const [tab, setTab] = useQueryState('tab', {
    shallow: false,
  });
  const client = useQueryClient();
  const handleSuccess = () => {
    toast.success('Integration created');
    popModal();
    client.refetchQueries([
      getQueryKey(api.integration.list),
      getQueryKey(api.integration.get, { id: props.id }),
    ]);
    if (tab !== undefined) {
      setTab('installed');
    }
  };

  const renderForm = () => {
    if (props.id && query.isLoading) {
      return null;
    }

    switch (integration?.type) {
      case 'webhook':
        return (
          <WebhookIntegrationForm
            defaultValues={query.data}
            onSuccess={handleSuccess}
          />
        );
      case 'discord':
        return (
          <DiscordIntegrationForm
            defaultValues={query.data}
            onSuccess={handleSuccess}
          />
        );
      case 'slack':
        return (
          <SlackIntegrationForm
            defaultValues={query.data}
            onSuccess={handleSuccess}
          />
        );
      default:
        return null;
    }
  };

  return (
    <SheetContent className="[&>button.absolute]:hidden">
      <ModalHeader title="Create an integration" />
      {renderCard()}
      {renderForm()}
    </SheetContent>
  );
}
