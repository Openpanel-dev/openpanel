'use client';

import type { IServiceOrganization } from '@/server/services/organization.service';
import { Building } from 'lucide-react';
import { useParams } from 'next/navigation';

interface LayoutOrganizationSelectorProps {
  organizations: IServiceOrganization[];
}

export default function LayoutOrganizationSelector({
  organizations,
}: LayoutOrganizationSelectorProps) {
  const params = useParams();

  const organization = organizations.find(
    (item) => item.id === params.organizationId
  );

  if (!organization) {
    return null;
  }

  return (
    <div className="border border-border p-3 flex gap-2 rounded items-center">
      <Building size={20} />
      <span className="font-medium text-sm">{organization.name}</span>
    </div>
  );
}
