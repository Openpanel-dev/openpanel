import FullPageLoadingState from '@/components/full-page-loading-state';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { handleError, useTRPC } from '@/integrations/trpc/react';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { CopyIcon, ShieldCheckIcon, ShieldOffIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export const Route = createFileRoute('/_app/account/_tabs/two-factor')({
  component: Component,
  pendingComponent: FullPageLoadingState,
});

function Component() {
  const trpc = useTRPC();
  const status = useSuspenseQuery(trpc.auth.totpStatus.queryOptions());

  return (
    <Widget className="max-w-screen-md w-full">
      <WidgetHead>
        <span className="title">Two-factor authentication</span>
      </WidgetHead>
      <WidgetBody className="col gap-4">
        <p className="text-sm text-muted-foreground">
          Protect your account with an authenticator app (Google Authenticator,
          1Password, Authy, etc.). You'll be asked for a 6-digit code each time
          you sign in with email and password.
        </p>

        {status.data.enabled ? (
          <EnabledView
            enabledAt={status.data.enabledAt!}
            remainingRecoveryCodes={status.data.remainingRecoveryCodes}
          />
        ) : (
          <DisabledView />
        )}
      </WidgetBody>
    </Widget>
  );
}

function DisabledView() {
  const [setupOpen, setSetupOpen] = useState(false);
  return (
    <>
      <div className="row items-center justify-between rounded-md border border-border bg-def-100 px-4 py-3">
        <div className="row items-center gap-2 text-sm">
          <ShieldOffIcon className="size-4 text-muted-foreground" />
          <span>Two-factor authentication is disabled.</span>
        </div>
        <Button size="sm" onClick={() => setSetupOpen(true)}>
          Enable
        </Button>
      </div>
      <SetupDialog open={setupOpen} onOpenChange={setSetupOpen} />
    </>
  );
}

function EnabledView({
  enabledAt,
  remainingRecoveryCodes,
}: {
  enabledAt: Date;
  remainingRecoveryCodes: number;
}) {
  const [disableOpen, setDisableOpen] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);

  return (
    <>
      <div className="row items-center justify-between rounded-md border border-border bg-def-100 px-4 py-3">
        <div className="row items-center gap-2 text-sm">
          <ShieldCheckIcon className="size-4 text-emerald-500" />
          <div className="col">
            <span>Two-factor authentication is enabled.</span>
            <span className="text-xs text-muted-foreground">
              Enabled {new Date(enabledAt).toLocaleString()} ·{' '}
              {remainingRecoveryCodes} recovery code
              {remainingRecoveryCodes === 1 ? '' : 's'} remaining
            </span>
          </div>
        </div>
      </div>

      <div className="row gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setRegenOpen(true)}
        >
          Regenerate recovery codes
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => setDisableOpen(true)}
        >
          Disable
        </Button>
      </div>

      <RegenerateDialog open={regenOpen} onOpenChange={setRegenOpen} />
      <DisableDialog open={disableOpen} onOpenChange={setDisableOpen} />
    </>
  );
}

function SetupDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
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
    }),
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
    }),
  );

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setStep('scan');
      setCode('');
      setSetupData(null);
      setRecoveryCodes([]);
    } else if (!setupData && !setupMutation.isPending) {
      setupMutation.mutate();
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        {step === 'scan' ? (
          <>
            <DialogHeader>
              <DialogTitle>Set up two-factor authentication</DialogTitle>
              <DialogDescription>
                Scan the QR code with your authenticator app, then enter the
                6-digit code to enable.
              </DialogDescription>
            </DialogHeader>

            {setupMutation.isPending || !setupData ? (
              <div className="center-center min-h-[260px]">
                <span className="text-sm text-muted-foreground">
                  Generating secret…
                </span>
              </div>
            ) : (
              <div className="col items-center gap-4">
                <img
                  src={setupData.qrDataUrl}
                  alt="Authenticator QR code"
                  className="rounded-md border border-border"
                  width={240}
                  height={240}
                />
                <div className="col w-full gap-1">
                  <Label className="text-xs text-muted-foreground">
                    Can't scan? Enter this secret manually:
                  </Label>
                  <code className="block rounded-md border border-border bg-def-100 px-3 py-2 font-mono text-xs break-all">
                    {setupData.secret}
                  </code>
                </div>
                <div className="col w-full items-center gap-2">
                  <Label>Verification code</Label>
                  <InputOTP
                    maxLength={6}
                    value={code}
                    onChange={setCode}
                    disabled={enableMutation.isPending}
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
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
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
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Save your recovery codes</DialogTitle>
              <DialogDescription>
                Store these somewhere safe. Each can be used once if you lose
                access to your authenticator. You won't see them again.
              </DialogDescription>
            </DialogHeader>
            <RecoveryCodesBlock codes={recoveryCodes} />
            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>
                I've saved my codes
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RegenerateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [newCodes, setNewCodes] = useState<string[] | null>(null);

  const mutation = useMutation(
    trpc.auth.totpRegenerateRecoveryCodes.mutationOptions({
      onSuccess: (data) => {
        setNewCodes(data.recoveryCodes);
        queryClient.invalidateQueries(trpc.auth.totpStatus.pathFilter());
      },
      onError: (error) => {
        toast.error(error.message);
        setCode('');
      },
    }),
  );

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setCode('');
      setNewCodes(null);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        {newCodes ? (
          <>
            <DialogHeader>
              <DialogTitle>New recovery codes</DialogTitle>
              <DialogDescription>
                Your old recovery codes are no longer valid.
              </DialogDescription>
            </DialogHeader>
            <RecoveryCodesBlock codes={newCodes} />
            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Regenerate recovery codes</DialogTitle>
              <DialogDescription>
                Enter a code from your authenticator app to generate a fresh
                set of recovery codes.
              </DialogDescription>
            </DialogHeader>
            <div className="col items-center gap-2">
              <InputOTP maxLength={6} value={code} onChange={setCode}>
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
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                disabled={code.length !== 6}
                loading={mutation.isPending}
                onClick={() => mutation.mutate({ code })}
              >
                Regenerate
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DisableDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');

  const mutation = useMutation(
    trpc.auth.totpDisable.mutationOptions({
      onSuccess: () => {
        toast.success('Two-factor authentication disabled');
        queryClient.invalidateQueries(trpc.auth.totpStatus.pathFilter());
        onOpenChange(false);
      },
      onError: (error) => {
        toast.error(error.message);
        setCode('');
      },
    }),
  );

  const handleOpenChange = (next: boolean) => {
    if (!next) setCode('');
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Disable two-factor authentication</DialogTitle>
          <DialogDescription>
            Enter a code from your authenticator app, or a recovery code, to
            confirm.
          </DialogDescription>
        </DialogHeader>
        <Input
          placeholder="123456 or ABCDE-FGHIJ"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoCapitalize="characters"
          autoFocus
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!code.trim()}
            loading={mutation.isPending}
            onClick={() => mutation.mutate({ code })}
          >
            Disable
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecoveryCodesBlock({ codes }: { codes: string[] }) {
  const copy = () => {
    navigator.clipboard.writeText(codes.join('\n'));
    toast.success('Copied to clipboard');
  };
  return (
    <div className="col gap-2">
      <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-def-100 p-3 font-mono text-sm">
        {codes.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      <Button
        size="sm"
        variant="outline"
        icon={CopyIcon}
        onClick={copy}
        className="self-start"
      >
        Copy all
      </Button>
    </div>
  );
}
