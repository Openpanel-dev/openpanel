import { Or } from '@/components/auth/or';
import { SignInGithub } from '@/components/auth/sign-in-github';
import { SignInGoogle } from '@/components/auth/sign-in-google';
import { SignUpEmailForm } from '@/components/auth/sign-up-email-form';
import { auth } from '@openpanel/auth/nextjs';
import { getInviteById } from '@openpanel/db';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import OnboardingLayout, { OnboardingDescription } from '../onboarding-layout';

const Page = async ({
  searchParams,
}: { searchParams: { inviteId: string } }) => {
  const session = await auth();
  const inviteId = await searchParams.inviteId;
  const invite = inviteId ? await getInviteById(inviteId) : null;
  const hasInviteExpired = invite?.expiresAt && invite.expiresAt < new Date();
  if (session.userId) {
    return redirect('/');
  }

  return (
    <div>
      <OnboardingLayout
        className="max-w-screen-sm"
        title="Create an account"
        description={
          <OnboardingDescription>
            Lets start with creating you account. By creating an account you
            accept the{' '}
            <Link target="_blank" href="https://openpanel.dev/terms">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link target="_blank" href="https://openpanel.dev/privacy">
              Privacy Policy
            </Link>
            .
          </OnboardingDescription>
        }
      >
        {invite && !hasInviteExpired && (
          <div className="card p-8 mb-8 col gap-2">
            <h2 className="text-2xl font-medium">
              Invitation to {invite.organization.name}
            </h2>
            <p>
              After you have created your account, you will be added to the
              organization.
            </p>
          </div>
        )}
        {invite && hasInviteExpired && (
          <div className="card p-8 mb-8 col gap-2">
            <h2 className="text-2xl font-medium">
              Invitation to {invite.organization.name} has expired
            </h2>
            <p>
              The invitation has expired. Please contact the organization owner
              to get a new invitation.
            </p>
          </div>
        )}
        <div className="col md:row gap-4">
          <SignInGithub type="sign-up" />
          <SignInGoogle type="sign-up" />
        </div>
        <Or className="my-8" />
        <div className="col gap-8 p-8 card">
          <h2 className="text-2xl font-medium">Sign up with email</h2>
          <SignUpEmailForm />
        </div>
      </OnboardingLayout>
    </div>
  );
};

export default Page;
