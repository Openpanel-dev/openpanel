import { useTRPC } from '@/integrations/trpc/react';

import { DiscordIntegrationForm } from '@/components/integrations/forms/discord-integration';
import { SlackIntegrationForm } from '@/components/integrations/forms/slack-integration';
import { WebhookIntegrationForm } from '@/components/integrations/forms/webhook-integration';
import { IntegrationCardContent } from '@/components/integrations/integration-card';
import { INTEGRATIONS } from '@/components/integrations/integrations';
import { SheetContent } from '@/components/ui/sheet';
import { useAppParams } from '@/hooks/use-app-params';
import type { IIntegrationConfig } from '@openpanel/validation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useQueryState } from 'nuqs';
import { toast } from 'sonner';
import { popModal } from '.';
import { ModalHeader } from './Modal/Container';

interface Props {
  id?: string;
  type: IIntegrationConfig['type'];
}
export default function AddIntegration(props: Props) {
  const { organizationId } = useAppParams();
  const trpc = useTRPC();
  const query = useQuery(
    trpc.integration.get.queryOptions(
      {
        id: props.id ?? '',
      },
      {
        enabled: !!props.id,
      },
    ),
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

  const navigate = useNavigate();
  const client = useQueryClient();
  const handleSuccess = () => {
    toast.success('Integration created');
    popModal();
    client.invalidateQueries(trpc.integration.list.pathFilter());
    client.invalidateQueries(
      trpc.integration.get.queryFilter({ id: props.id }),
    );
    navigate({
      to: '/$organizationId/integrations/installed',
      params: {
        organizationId,
      },
    });
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
