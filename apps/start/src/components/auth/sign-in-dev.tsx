import { useMutation } from '@tanstack/react-query';
import { TerminalIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { useTRPC } from '@/integrations/trpc/react';

/** Only rendered when the API reports `DEV_LOGIN`, which production refuses. */
export function SignInDev({ inviteId }: { inviteId?: string }) {
  const trpc = useTRPC();
  const mutation = useMutation(
    trpc.auth.signInDev.mutationOptions({
      onSuccess(data) {
        if (data.type === 'totp_required') {
          window.location.href = '/verify';
          return;
        }
        window.location.href = '/';
      },
      onError(error) {
        toast.error(error.message);
      },
    })
  );
  return (
    <Button
      className="w-full"
      icon={TerminalIcon}
      loading={mutation.isPending}
      onClick={() => mutation.mutate({ inviteId })}
      size="xl"
      variant="secondary"
    >
      Dev login
    </Button>
  );
}
