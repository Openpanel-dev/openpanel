import { auth } from '@clerk/nextjs';
import { redirect } from 'next/navigation';

import GetStartedClient from './get-started';

// Sign up
const GetStarted = () => {
  const session = auth();
  if (session.userId) {
    return redirect('/');
  }
  return <GetStartedClient />;
};

export default GetStarted;
