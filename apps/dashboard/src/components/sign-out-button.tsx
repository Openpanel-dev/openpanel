'use client';

import { LogOutIcon } from 'lucide-react';

import { useLogout } from '@/hooks/useLogout';
import { Button } from './ui/button';

const SignOutButton = () => {
  const logout = useLogout();
  return (
    <Button variant={'secondary'} icon={LogOutIcon} onClick={() => logout()}>
      Sign out
    </Button>
  );
};

export default SignOutButton;
