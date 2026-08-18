import { useTRPC } from '@/integrations/trpc/react';

import { IntegrationCardContent } from '@/components/integrations/integration-card';
import {
  CLIENT_INTEGRATIONS,
  INTEGRATIONS,
} from '@/components/integrations/integrations';
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
  const { organizationId, projectId } = useAppParams();
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
      to: '/$organizationId/$projectId/integrations/installed',
      params: {
        organizationId,
        projectId,
      },
    });
  };

  const renderForm = () => {
    if (props.id && query.isLoading) {
      return null;
    }

    const Form = CLIENT_INTEGRATIONS[props.type]?.Form;
    if (!Form) {
      return null;
    }
    return <Form defaultValues={query.data} onSuccess={handleSuccess} />;
  };

  return (
    <SheetContent className="[&>button.absolute]:hidden">
      <ModalHeader title="Create an integration" />
      {renderCard()}
      {renderForm()}
    </SheetContent>
  );
}
