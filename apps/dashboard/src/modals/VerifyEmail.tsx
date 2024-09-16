'use client';

import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { getClerkError } from '@/utils/clerk-error';
import { useSignUp } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

type Props = {
  email: string;
};

export default function VerifyEmail({ email }: Props) {
  const { signUp, setActive, isLoaded } = useSignUp();
  const router = useRouter();
  const [code, setCode] = useState('');

  return (
    <ModalContent
      onPointerDownOutside={(e) => e.preventDefault()}
      onEscapeKeyDown={(e) => e.preventDefault()}
    >
      <ModalHeader
        title="Verify your email"
        text={
          <p>
            Please enter the verification code sent to your{' '}
            <span className="font-semibold">{email}</span>.
          </p>
        }
      />

      <InputOTP
        maxLength={6}
        value={code}
        onChange={setCode}
        onComplete={async () => {
          if (!isLoaded) {
            return toast.info('Sign up is not available at the moment');
          }

          try {
            const completeSignUp = await signUp.attemptEmailAddressVerification(
              {
                code,
              },
            );

            if (completeSignUp.status !== 'complete') {
              // The status can also be `abandoned` or `missing_requirements`
              // Please see https://clerk.com/docs/references/react/use-sign-up#result-status for  more information
              return toast.error('Invalid code');
            }

            // Check the status to see if it is complete
            // If complete, the user has been created -- set the session active
            if (completeSignUp.status === 'complete') {
              await setActive({ session: completeSignUp.createdSessionId });
              router.push('/onboarding');
              popModal();
            }
          } catch (e) {
            const error = getClerkError(e);
            if (error) {
              toast.error(error.longMessage);
            } else {
              toast.error('An error occurred, please try again later');
            }
          }
        }}
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
    </ModalContent>
  );
}
