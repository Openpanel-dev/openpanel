import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DownloadIcon } from 'lucide-react';
import QRCode from 'qrcode';
import { useState } from 'react';
import { toast } from 'sonner';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';
import CopyInput from '@/components/forms/copy-input';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { Label } from '@/components/ui/label';
import { unwrap, useAuthClient } from '@/integrations/auth/client';
import { toastAuthError } from '@/integrations/auth/toast-auth-error';
import { useTRPC } from '@/integrations/trpc/react';

const QR_SIZE = 240;

interface Enrollment {
  qrDataUrl: string;
  secret: string;
  backupCodes: string[];
}

async function toEnrollment(
  totpURI: string,
  backupCodes: string[]
): Promise<Enrollment> {
  return {
    qrDataUrl: await QRCode.toDataURL(totpURI, { margin: 1, width: QR_SIZE }),
    secret: new URL(totpURI).searchParams.get('secret') ?? '',
    backupCodes,
  };
}

export default function SetupTwoFactor() {
  const trpc = useTRPC();
  const authClient = useAuthClient();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<'password' | 'scan' | 'recovery'>(
    'password'
  );
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);

  const enableMutation = useMutation({
    mutationFn: async () => {
      const data = await unwrap(authClient.twoFactor.enable({ password }));
      if (data.method !== 'totp') {
        throw new Error('Authenticator apps are not available');
      }
      return toEnrollment(data.totpURI, data.backupCodes);
    },
    onSuccess: (data) => {
      setEnrollment(data);
      setStep('scan');
    },
    onError: (error) => {
      toastAuthError(error);
      setPassword('');
    },
  });

  const verifyMutation = useMutation({
    mutationFn: () => unwrap(authClient.twoFactor.verifyTotp({ code })),
    onSuccess: () => {
      setStep('recovery');
      queryClient.invalidateQueries(trpc.auth.twoFactorStatus.pathFilter());
    },
    onError: (error) => {
      toast.error(error.message);
      setCode('');
    },
  });

  if (step === 'recovery' && enrollment) {
    return (
      <ModalContent>
        <ModalHeader
          text="Store these somewhere safe. Each can be used once if you lose access to your authenticator. You won't see them again."
          title="Save your recovery codes"
        />
        <RecoveryCodesBlock codes={enrollment.backupCodes} />
        <DialogFooter>
          <Button onClick={() => popModal()}>I've saved my codes</Button>
        </DialogFooter>
      </ModalContent>
    );
  }

  if (step === 'scan' && enrollment) {
    return (
      <ModalContent>
        <ModalHeader
          text="Scan the QR code with your authenticator app, then enter the 6-digit code to enable."
          title="Set up two-factor authentication"
        />
        <div className="col gap-4">
          <img
            alt="Authenticator QR code"
            className="rounded-md border border-border"
            height={QR_SIZE}
            src={enrollment.qrDataUrl}
            width={QR_SIZE}
          />
          <CopyInput
            className="w-full"
            label="Can't scan? Enter this secret manually"
            value={enrollment.secret}
          />
          <div className="col w-full gap-2">
            <Label className="mb-1">Verification code</Label>
            <InputOTP
              disabled={verifyMutation.isPending}
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
        <DialogFooter>
          <Button onClick={() => popModal()} variant="secondary">
            Cancel
          </Button>
          <Button
            disabled={code.length !== 6}
            loading={verifyMutation.isPending}
            onClick={() => verifyMutation.mutate()}
          >
            Enable
          </Button>
        </DialogFooter>
      </ModalContent>
    );
  }

  return (
    <ModalContent>
      <ModalHeader
        text="Enter your password to start setting up an authenticator app."
        title="Set up two-factor authentication"
      />
      <Input
        aria-label="Password"
        autoComplete="current-password"
        autoFocus
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Your password"
        type="password"
        value={password}
      />
      <DialogFooter>
        <Button onClick={() => popModal()} variant="secondary">
          Cancel
        </Button>
        <Button
          disabled={!password}
          loading={enableMutation.isPending}
          onClick={() => enableMutation.mutate()}
        >
          Continue
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
