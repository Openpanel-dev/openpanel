import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { GlobeIcon, KeyIcon, UserIcon } from 'lucide-react';

import { ModalContent, ModalHeader } from './Modal/Container';

export default function OnboardingTroubleshoot() {
  return (
    <ModalContent>
      <ModalHeader
        title="Troubleshoot"
        text="Hmm, you have troubles? Well, let's solve them together."
      />
      <div className="flex flex-col gap-4">
        <Alert>
          <UserIcon size={16} />
          <AlertTitle>Wrong client ID</AlertTitle>
          <AlertDescription>
            Make sure your <code>clientId</code> is correct
          </AlertDescription>
        </Alert>
        <Alert>
          <GlobeIcon size={16} />
          <AlertTitle>Wrong domain on web</AlertTitle>
          <AlertDescription>
            For web apps its important that the domain is correctly configured.
            We authenticate the requests based on the domain.
          </AlertDescription>
        </Alert>
        <Alert>
          <KeyIcon size={16} />
          <AlertTitle>Wrong client secret</AlertTitle>
          <AlertDescription>
            For app and backend events it&apos;s important that you have correct{' '}
            <code>clientId</code> and <code>clientSecret</code>
          </AlertDescription>
        </Alert>
      </div>
      <p className="mt-4 text-sm">
        Still have issues? Join our{' '}
        <a href="https://go.openpanel.dev/discord" className="underline">
          discord channel
        </a>{' '}
        give us an email at{' '}
        <a href="mailto:hello@openpanel.dev" className="underline">
          hello@openpanel.dev
        </a>{' '}
        and we&apos;ll help you out.
      </p>
    </ModalContent>
  );
}
