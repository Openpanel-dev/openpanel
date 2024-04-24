import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import PageClient from './page.client';

export const dynamic = 'force-dynamic';

// Sign up
const Page = () => {
  const session = auth();
  if (session.userId) {
    return redirect('/');
  }
  return <PageClient />;
};

export default Page;
