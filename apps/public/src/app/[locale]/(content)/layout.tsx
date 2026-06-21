import { Footer } from '@/components/footer';
import Navbar from '@/components/navbar';
import { getAppLocale } from '@/i18n/server';
import type { ReactNode } from 'react';

export default async function Layout({
  children,
}: {
  children: ReactNode;
}): Promise<React.ReactElement> {
  const locale = await getAppLocale();

  return (
    <>
      <Navbar />
      <main>{children}</main>
      <Footer />
    </>
  );
}
