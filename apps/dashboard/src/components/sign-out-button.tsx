'use client';

import { SignOutButton as ClerkSignOutButton } from '@clerk/nextjs';
import { LogOutIcon } from 'lucide-react';

import { Button } from './ui/button';

const SignOutButton = () => {
  return (
    <ClerkSignOutButton>
      <Button variant={'secondary'} icon={LogOutIcon}>
        Sign out
      </Button>
    </ClerkSignOutButton>
  );
};

export default SignOutButton;
