import PageLayout from '@/app/(app)/[organizationId]/[projectId]/page-layout';
import { Pencil } from 'lucide-react';

import ReportEditor from './report-editor';

interface PageProps {
  params: {
    organizationId: string;
    projectId: string;
  };
}

export default function Page({ params: { organizationId } }: PageProps) {
  return (
    <PageLayout
      organizationSlug={organizationId}
      title={
        <div className="flex gap-2 items-center cursor-pointer">
          Unnamed report
          <Pencil size={16} />
        </div>
      }
    >
      <ReportEditor report={null} />
    </PageLayout>
  );
}
