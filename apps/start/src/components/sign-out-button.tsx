import { LogOutIcon } from 'lucide-react';

import { useLogout } from '@/hooks/use-logout';
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
