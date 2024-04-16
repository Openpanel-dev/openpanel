import { auth } from '@clerk/nextjs';
import { redirect } from 'next/navigation';

import PageClient from './page.client';

// Sign up
const Page = () => {
  const session = auth();
  if (session.userId) {
    return redirect('/');
  }
  return <PageClient />;
};

export default Page;
