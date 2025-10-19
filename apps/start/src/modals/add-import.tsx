import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppParams } from '@/hooks/use-app-params';
import { useTRPC } from '@/integrations/trpc/react';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

type Provider = 'umami' | 'plausible' | 'mixpanel';

interface ImportConfig {
  type: Provider;
  fileUrl?: string;
  apiKey?: string;
  apiSecret?: string;
  projectId?: string;
}

interface AddImportProps {
  provider: Provider;
  providerName: string;
  sourceType: 'file' | 'api';
}

export default function AddImport({
  provider,
  providerName,
  sourceType,
}: AddImportProps) {
  const { projectId } = useAppParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [config, setConfig] = useState<ImportConfig>({
    type: provider,
    ...(sourceType === 'file'
      ? { fileUrl: '' }
      : { apiKey: '', apiSecret: '', projectId: '' }),
  });

  const createImport = useMutation(
    trpc.import.create.mutationOptions({
      onSuccess: () => {
        toast.success('Import started', {
          description: 'Your data import has been queued for processing.',
        });
        popModal();
        queryClient.invalidateQueries(trpc.import.list.pathFilter());
      },
      onError: (error) => {
        toast.error('Import failed', {
          description: error.message,
        });
      },
    }),
  );

  const handleSubmit = () => {
    if (sourceType === 'file') {
      createImport.mutate({
        projectId,
        provider,
        config: {
          type: provider as 'umami' | 'plausible',
          fileUrl: config.fileUrl || '',
        },
      });
    } else {
      createImport.mutate({
        projectId,
        provider: 'mixpanel',
        config: {
          type: 'mixpanel',
          apiKey: config.apiKey || '',
          apiSecret: config.apiSecret || '',
          projectId: config.projectId || '',
        },
      });
    }
  };

  const isDisabled =
    createImport.isPending ||
    (sourceType === 'file' && !config.fileUrl) ||
    (sourceType === 'api' &&
      (!config.apiKey || !config.apiSecret || !config.projectId));

  return (
    <ModalContent>
      <ModalHeader title={`Import from ${providerName}`} />

      <div className="space-y-4 py-4">
        {sourceType === 'file' && (
          <div className="space-y-2">
            <Label htmlFor="fileUrl">File URL</Label>
            <Input
              id="fileUrl"
              placeholder="https://example.com/export.csv"
              value={config.fileUrl}
              onChange={(e) =>
                setConfig({ ...config, fileUrl: e.target.value })
              }
            />
            <p className="text-sm text-muted-foreground">
              Provide a publicly accessible URL to your exported CSV file.
            </p>
          </div>
        )}

        {sourceType === 'api' && (
          <>
            <div className="space-y-2">
              <Label htmlFor="projectId">Project ID</Label>
              <Input
                id="projectId"
                placeholder="Your Mixpanel project ID"
                value={config.projectId}
                onChange={(e) =>
                  setConfig({ ...config, projectId: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key</Label>
              <Input
                id="apiKey"
                placeholder="Your Mixpanel API key"
                value={config.apiKey}
                onChange={(e) =>
                  setConfig({ ...config, apiKey: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apiSecret">API Secret</Label>
              <Input
                id="apiSecret"
                type="password"
                placeholder="Your Mixpanel API secret"
                value={config.apiSecret}
                onChange={(e) =>
                  setConfig({ ...config, apiSecret: e.target.value })
                }
              />
            </div>
          </>
        )}
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => popModal()}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={isDisabled}>
          {createImport.isPending ? 'Starting...' : 'Start Import'}
        </Button>
      </div>
    </ModalContent>
  );
}
