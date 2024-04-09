import PageLayout from '@/app/(app)/[organizationSlug]/[projectId]/page-layout';
import { Pencil } from 'lucide-react';

import ReportEditor from './report-editor';

interface PageProps {
  params: {
    organizationSlug: string;
    projectId: string;
  };
}

export default function Page({ params: { organizationSlug } }: PageProps) {
  return (
    <PageLayout
      organizationSlug={organizationSlug}
      title={
        <div className="flex cursor-pointer items-center gap-2">
          Unnamed report
          <Pencil size={16} />
        </div>
      }
    >
      <ReportEditor report={null} />
    </PageLayout>
  );
}
