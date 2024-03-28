'use client';

import { Combobox } from '@/components/ui/combobox';
import { useAppParams } from '@/hooks/useAppParams';
import { Building } from 'lucide-react';
import { useRouter } from 'next/navigation';

import type { IServiceOrganization } from '@openpanel/db';

interface LayoutOrganizationSelectorProps {
  organizations: IServiceOrganization[];
}

export default function LayoutOrganizationSelector({
  organizations,
}: LayoutOrganizationSelectorProps) {
  const params = useAppParams();
  const router = useRouter();

  const organization = organizations.find(
    (item) => item.slug === params.organizationId
  );

  if (!organization) {
    return null;
  }

  return (
    <Combobox
      className="w-full"
      placeholder="Select organization"
      icon={Building}
      value={organization.slug}
      items={
        organizations
          .filter((item) => item.slug)
          .map((item) => ({
            label: item.name,
            value: item.slug,
          })) ?? []
      }
      onChange={(value) => {
        router.push(`/${value}`);
      }}
    />
  );
}
