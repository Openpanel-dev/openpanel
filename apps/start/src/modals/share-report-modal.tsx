import { zodResolver } from '@hookform/resolvers/zod';
import { zShareReport } from '@openpanel/core/modules/share/share.constants';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { CheckCircle2, Copy, ExternalLink, TrashIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';
import { ButtonContainer } from '@/components/button-container';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltiper } from '@/components/ui/tooltip';
import { useAppParams } from '@/hooks/use-app-params';
import { handleError, useTRPC } from '@/integrations/trpc/react';

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
    trpc.share.reportSettings.queryOptions({
      projectId,
      reportId,
    })
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
      password: existingShare?.hasPassword ? '••••••••' : '',
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
        queryClient.invalidateQueries(trpc.share.reportSettings.pathFilter());
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
    })
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
        text={
          isShared
            ? 'Your report is currently public and can be accessed by anyone with the link.'
            : 'You can choose if you want to add a password to make it a bit more private.'
        }
        title="Report public availability"
      />

      {isShared && (
        <div className="space-y-3 rounded-lg border bg-def-100 p-4">
          <div className="flex items-center gap-2 text-green-600 text-sm dark:text-green-400">
            <CheckCircle2 className="size-4" />
            <span className="font-medium">Currently shared</span>
          </div>
          <div className="flex items-center gap-1">
            <Input className="flex-1 text-sm" readOnly value={shareUrl} />
            <Tooltiper content="Copy link">
              <Button
                onClick={handleCopyLink}
                size="sm"
                type="button"
                variant="outline"
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
                onClick={() => window.open(shareUrl, '_blank')}
                size="sm"
                type="button"
                variant="outline"
              >
                <ExternalLink className="size-4" />
              </Button>
            </Tooltiper>
            <Tooltiper content="Make private">
              <Button
                onClick={handleMakePrivate}
                type="button"
                variant="destructive"
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
          <Button onClick={() => popModal()} type="button" variant="outline">
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
