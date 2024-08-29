import PageLayout from '@/app/(app)/[organizationSlug]/[projectId]/page-layout';
import EditReportName from '@/components/report/edit-report-name';
import { notFound } from 'next/navigation';

import { getReportById } from '@openpanel/db';

import ReportEditor from '../report-editor';

interface PageProps {
  params: {
    projectId: string;
    reportId: string;
  };
}

export default async function Page({ params: { reportId } }: PageProps) {
  const report = await getReportById(reportId);

  if (!report) {
    return notFound();
  }

  return (
    <>
      <PageLayout title={<EditReportName name={report.name} />} />
      <ReportEditor report={report} />
    </>
  );
}
