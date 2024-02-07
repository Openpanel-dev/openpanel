'use client';

import { useAppParams } from '@/hooks/useAppParams';
import type { IServiceOrganization } from '@/server/services/organization.service';
import { Building } from 'lucide-react';

interface LayoutOrganizationSelectorProps {
  organizations: IServiceOrganization[];
}

export default function LayoutOrganizationSelector({
  organizations,
}: LayoutOrganizationSelectorProps) {
  const params = useAppParams();

  const organization = organizations.find(
    (item) => item.slug === params.organizationId
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
