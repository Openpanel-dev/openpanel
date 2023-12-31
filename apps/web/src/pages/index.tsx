import { MainLayout } from '@/components/layouts/MainLayout';
import { createServerSideProps } from '@/server/getServerSideProps';

export const getServerSideProps = createServerSideProps();

export default function Home() {
  return (
    <MainLayout>
      <div />
    </MainLayout>
  );
}
