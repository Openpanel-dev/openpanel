import { Funnel } from '@/components/report/funnel';

import PageLayout from '../page-layout';

export const metadata = {
  title: 'Funnel - Openpanel.dev',
};

interface PageProps {
  params: {
    organizationId: string;
  };
}

export default function Page({ params: { organizationId } }: PageProps) {
  return (
    <PageLayout title="Funnel" organizationSlug={organizationId}>
      <Funnel />
    </PageLayout>
  );
}
