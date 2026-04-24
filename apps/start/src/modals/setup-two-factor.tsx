import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DownloadIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';
import CopyInput from '@/components/forms/copy-input';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { Label } from '@/components/ui/label';
import { handleError, useTRPC } from '@/integrations/trpc/react';

export default function SetupTwoFactor() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<'scan' | 'recovery'>('scan');
  const [code, setCode] = useState('');
  const [setupData, setSetupData] = useState<{
    qrDataUrl: string;
    secret: string;
  } | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  const setupMutation = useMutation(
    trpc.auth.totpSetup.mutationOptions({
      onSuccess: (data) => {
        setSetupData({ qrDataUrl: data.qrDataUrl, secret: data.secret });
      },
      onError: handleError,
    })
  );

  const enableMutation = useMutation(
    trpc.auth.totpEnable.mutationOptions({
      onSuccess: (data) => {
        setRecoveryCodes(data.recoveryCodes);
        setStep('recovery');
        queryClient.invalidateQueries(trpc.auth.totpStatus.pathFilter());
      },
      onError: (error) => {
        toast.error(error.message);
        setCode('');
      },
    })
  );

  useEffect(() => {
    setupMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (step === 'recovery') {
    return (
      <ModalContent>
        <ModalHeader
          text="Store these somewhere safe. Each can be used once if you lose access to your authenticator. You won't see them again."
          title="Save your recovery codes"
        />
        <RecoveryCodesBlock codes={recoveryCodes} />
        <DialogFooter>
          <Button onClick={() => popModal()}>I've saved my codes</Button>
        </DialogFooter>
      </ModalContent>
    );
  }

  return (
    <ModalContent>
      <ModalHeader
        text="Scan the QR code with your authenticator app, then enter the 6-digit code to enable."
        title="Set up two-factor authentication"
      />

      {setupMutation.isPending || !setupData ? (
        <div className="center-center min-h-[260px]">
          <span className="text-muted-foreground text-sm">
            Generating secret…
          </span>
        </div>
      ) : (
        <div className="col gap-4">
          <img
            alt="Authenticator QR code"
            className="rounded-md border border-border"
            height={240}
            src={setupData.qrDataUrl}
            width={240}
          />
          <CopyInput
            className="w-full"
            label="Can't scan? Enter this secret manually"
            value={setupData.secret}
          />
          <div className="col w-full gap-2">
            <Label className="mb-1">Verification code</Label>
            <InputOTP
              disabled={enableMutation.isPending}
              maxLength={6}
              onChange={setCode}
              value={code}
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>
        </div>
      )}

      <DialogFooter>
        <Button onClick={() => popModal()} variant="secondary">
          Cancel
        </Button>
        <Button
          disabled={code.length !== 6}
          loading={enableMutation.isPending}
          onClick={() => enableMutation.mutate({ code })}
        >
          Enable
        </Button>
      </DialogFooter>
    </ModalContent>
  );
}

function RecoveryCodesBlock({ codes }: { codes: string[] }) {
  return (
    <div className="col gap-2">
      <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-def-100 p-3 font-mono text-sm">
        {codes.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      <div className="row gap-2">
        <Button
          className="self-start"
          icon={DownloadIcon}
          onClick={() => {
            const blob = new Blob([codes.join('\n')], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'recovery-codes.txt';
            a.click();
            URL.revokeObjectURL(url);
          }}
          size="sm"
          variant="outline"
        >
          Download
        </Button>
        <Button
          className="self-start"
          onClick={() => {
            navigator.clipboard.writeText(codes.join('\n'));
            toast.success('Copied to clipboard');
          }}
          size="sm"
          variant="outline"
        >
          Copy all
        </Button>
      </div>
    </div>
  );
}
