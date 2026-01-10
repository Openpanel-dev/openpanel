import { ButtonContainer } from '@/components/button-container';
import { Button } from '@/components/ui/button';
import { useAppParams } from '@/hooks/use-app-params';
import { handleError } from '@/integrations/trpc/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';

import { zShareReport } from '@openpanel/validation';

import { Input } from '@/components/ui/input';
import { Tooltiper } from '@/components/ui/tooltip';
import { useTRPC } from '@/integrations/trpc/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Copy, ExternalLink, TrashIcon } from 'lucide-react';
import { useState } from 'react';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

const validator = zShareReport;

type IForm = z.infer<typeof validator>;

export default function ShareReportModal({ reportId }: { reportId: string }) {
  const { projectId, organizationId } = useAppParams();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const trpc = useTRPC();
  const queryClient = useQueryClient();

  // Fetch current share status
  const shareQuery = useQuery(
    trpc.share.report.queryOptions({
      reportId,
    }),
  );

  const existingShare = shareQuery.data;
  const isShared = existingShare?.public ?? false;
  const shareUrl = existingShare?.id
    ? `${window.location.origin}/share/report/${existingShare.id}`
    : '';

  const { register, handleSubmit, watch } = useForm<IForm>({
    resolver: zodResolver(validator),
    defaultValues: {
      public: true,
      password: existingShare?.password ? '••••••••' : '',
      projectId,
      organizationId,
      reportId,
    },
  });

  const password = watch('password');

  const mutation = useMutation(
    trpc.share.createReport.mutationOptions({
      onError: handleError,
      onSuccess(res) {
        queryClient.invalidateQueries(trpc.share.report.pathFilter());
        toast('Success', {
          description: `Your report is now ${res.public ? 'public' : 'private'}`,
          action: res.public
            ? {
                label: 'View',
                onClick: () =>
                  navigate({
                    to: '/share/report/$shareId',
                    params: {
                      shareId: res.id,
                    },
                  }),
              }
            : undefined,
        });
        popModal();
      },
    }),
  );

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast('Link copied to clipboard');
  };

  const handleMakePrivate = () => {
    mutation.mutate({
      public: false,
      password: null,
      projectId,
      organizationId,
      reportId,
    });
  };

  return (
    <ModalContent className="max-w-md">
      <ModalHeader
        title="Report public availability"
        text={
          isShared
            ? 'Your report is currently public and can be accessed by anyone with the link.'
            : 'You can choose if you want to add a password to make it a bit more private.'
        }
      />

      {isShared && (
        <div className="p-4 bg-def-100 border rounded-lg space-y-3">
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <CheckCircle2 className="size-4" />
            <span className="font-medium">Currently shared</span>
          </div>
          <div className="flex items-center gap-1">
            <Input value={shareUrl} readOnly className="flex-1 text-sm" />
            <Tooltiper content="Copy link">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopyLink}
              >
                {copied ? (
                  <CheckCircle2 className="size-4" />
                ) : (
                  <Copy className="size-4" />
                )}
              </Button>
            </Tooltiper>
            <Tooltiper content="Open in new tab">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => window.open(shareUrl, '_blank')}
              >
                <ExternalLink className="size-4" />
              </Button>
            </Tooltiper>
            <Tooltiper content="Make private">
              <Button
                type="button"
                variant="destructive"
                onClick={handleMakePrivate}
              >
                <TrashIcon className="size-4" />
              </Button>
            </Tooltiper>
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit((values) => {
          mutation.mutate({
            ...values,
            // Only send password if it's not the placeholder
            password:
              values.password === '••••••••' ? null : values.password || null,
          });
        })}
      >
        <Input
          {...register('password')}
          placeholder="Enter your password (optional)"
          size="large"
          type={password === '••••••••' ? 'text' : 'password'}
        />
        <ButtonContainer>
          <Button type="button" variant="outline" onClick={() => popModal()}>
            Cancel
          </Button>

          <Button type="submit">
            {isShared ? 'Update' : 'Make it public'}
          </Button>
        </ButtonContainer>
      </form>
    </ModalContent>
  );
}