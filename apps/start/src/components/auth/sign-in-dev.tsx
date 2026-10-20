import { useMutation } from '@tanstack/react-query';
import { TerminalIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { useTRPC } from '@/integrations/trpc/react';

/** Only rendered when the API reports `DEV_LOGIN`, which production refuses. */
export function SignInDev() {
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
      loading={mutation.isPending}
      onClick={() => mutation.mutate()}
      size="lg"
      variant="outline"
    >
      <TerminalIcon className="mr-2 size-4" />
      Dev login
    </Button>
  );
}
