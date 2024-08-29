import PageLayout from '@/app/(app)/[organizationSlug]/[projectId]/page-layout';
import EditReportName from '@/components/report/edit-report-name';

import ReportEditor from './report-editor';

export default function Page() {
  return (
    <>
      <PageLayout title={<EditReportName name={undefined} />} />
      <ReportEditor report={null} />
    </>
  );
}
