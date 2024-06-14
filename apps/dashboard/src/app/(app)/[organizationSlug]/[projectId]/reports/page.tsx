import PageLayout from '@/app/(app)/[organizationSlug]/[projectId]/page-layout';
import EditReportName from '@/components/report/edit-report-name';
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
    <>
      <PageLayout
        organizationSlug={organizationSlug}
        title={<EditReportName name={undefined} />}
      />
      <ReportEditor report={null} />
    </>
  );
}
