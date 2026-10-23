import type { IPublicClient } from '@openpanel/core';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { InstallGuide } from '@/components/onboarding/install-guide';
import { Combobox } from '@/components/ui/combobox';
import { useAppContext } from '@/hooks/use-app-context';
import { useAppParams } from '@/hooks/use-app-params';
import { useTRPC } from '@/integrations/trpc/react';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/settings/_tabs/tracking'
)({
  component: Component,
});

function Component() {
  const { projectId } = useAppParams();
  const trpc = useTRPC();
  const { apiUrl, isSelfHosted } = useAppContext();
  const { data: project } = useQuery(
    trpc.project.getProjectWithClients.queryOptions({ projectId })
  );
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const clients: IPublicClient[] = project?.clients ?? [];
  const client =
    clients.find((candidate) => candidate.id === selectedClientId) ??
    clients[0];

  if (!(project && client)) {
    return null;
  }

  return (
    <div className="col gap-6">
      {clients.length > 1 && (
        <Combobox
          items={clients.map((candidate) => ({
            value: candidate.id,
            label: candidate.name,
          }))}
          onChange={setSelectedClientId}
          placeholder="Select client"
          searchable
          value={client.id}
        />
      )}
      <InstallGuide
        context={{
          clientId: client.id,
          // Secrets are stored hashed; after creation only the snippet
          // placeholder remains.
          clientSecret: null,
          apiUrl: isSelfHosted ? apiUrl : null,
        }}
        defaultMethod="manual"
        projectId={project.id}
        projectName={project.name}
        projectTypes={project.types}
      />
    </div>
  );
}
