import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { handleError, useTRPC } from '@/integrations/trpc/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SaveIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';
import CopyInput from '@/components/forms/copy-input';

const validation = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  expiresAt: z.string().optional(),
  organizationId: z.string(),
});

type IForm = z.infer<typeof validation>;

interface Props {
  organizationId: string;
}

export default function CreatePAT({ organizationId }: Props) {
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  const form = useForm<IForm>({
    resolver: zodResolver(validation),
    defaultValues: { name: '', expiresAt: '', organizationId },
  });

  const mutation = useMutation(
    trpc.pat.create.mutationOptions({
      onSuccess(data) {
        setCreatedToken(data.token);
        queryClient.invalidateQueries(
          trpc.pat.list.queryFilter({ organizationId }),
        );
      },
      onError: handleError,
    }),
  );

  const onSubmit = (values: IForm) => {
    mutation.mutate({
      name: values.name,
      organizationId: values.organizationId,
      expiresAt: values.expiresAt ? new Date(values.expiresAt) : undefined,
    });
  };

  if (createdToken) {
    return (
      <ModalContent>
        <ModalHeader
          title="Token created"
          text="Copy your token now — it won't be shown again."
        />
        <div className="my-4">
          <CopyInput label={null} value={createdToken} />
          <p className="mt-2 text-sm text-muted-foreground">
            Use this token as a Bearer header:
            <code className="ml-1 rounded bg-muted px-1 py-0.5 text-xs">
              Authorization: Bearer {createdToken.slice(0, 16)}…
            </code>
          </p>
        </div>
        <Button className="w-full" onClick={() => popModal()}>
          Done
        </Button>
      </ModalContent>
    );
  }

  return (
    <ModalContent>
      <ModalHeader
        title="Create personal access token"
        text="Tokens let you authenticate with the API from scripts and CI/CD pipelines."
      />
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <div>
          <Label>Token name</Label>
          <Input
            placeholder="e.g. CI/CD pipeline"
            error={form.formState.errors.name?.message}
            {...form.register('name')}
          />
        </div>
        <div>
          <Label>Expires at (optional)</Label>
          <Input
            type="date"
            {...form.register('expiresAt')}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => popModal()}>
            Cancel
          </Button>
          <Button type="submit" icon={SaveIcon} loading={mutation.isPending}>
            Create token
          </Button>
        </DialogFooter>
      </form>
    </ModalContent>
  );
}
