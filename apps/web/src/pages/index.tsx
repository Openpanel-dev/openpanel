import { useEffect } from 'react';
import { MainLayout } from '@/components/layouts/MainLayout';
import { createServerSideProps } from '@/server/getServerSideProps';
import { api } from '@/utils/api';
import { useRouter } from 'next/router';

export const getServerSideProps = createServerSideProps();

export default function Home() {
  const router = useRouter();
  const query = api.organization.first.useQuery();
  const organization = query.data ?? null;

  useEffect(() => {
    if (organization) {
      router.replace(`/${organization.slug}`);
    }
  }, [organization, router]);

  return (
    <MainLayout>
      <div />
    </MainLayout>
  );
}
