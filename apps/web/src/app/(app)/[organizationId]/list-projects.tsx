'use client';

import { Card } from '@/components/Card';
import { pushModal } from '@/modals';
import type { getProjectsByOrganizationId } from '@/server/services/project.service';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface ListProjectsProps {
  projects: Awaited<ReturnType<typeof getProjectsByOrganizationId>>;
}

export function ListProjects({ projects }: ListProjectsProps) {
  const params = useParams();
  const organizationId = params.organizationId as string;

  return (
    <>
      <div className="grid sm:grid-cols-2 gap-4 p-4">
        {projects.map((item) => (
          <Card key={item.id} hover>
            <div>
              <Link
                href={`/${organizationId}/${item.id}`}
                className="block p-4 flex flex-col"
              >
                <span className="font-medium">{item.name}</span>
              </Link>
            </div>
          </Card>
        ))}
        <Card hover className="border-dashed">
          <button
            className="flex items-center justify-between w-full p-4 font-medium leading-none"
            onClick={() => {
              pushModal('AddProject', {
                organizationId,
              });
            }}
          >
            Create new project
            <Plus size={16} />
          </button>
        </Card>
      </div>
    </>
  );
}
