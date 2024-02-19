import PageLayout from '@/app/(app)/[organizationId]/[projectId]/page-layout';
import { getExists } from '@/server/pageExists';
import { Pencil } from 'lucide-react';
import { notFound } from 'next/navigation';

import { getOrganizationBySlug } from '@mixan/db';

import ReportEditor from './report-editor';

interface PageProps {
  params: {
    organizationId: string;
    projectId: string;
  };
}

export default async function Page({
  params: { organizationId, projectId },
}: PageProps) {
  await getExists(organizationId, projectId);

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
