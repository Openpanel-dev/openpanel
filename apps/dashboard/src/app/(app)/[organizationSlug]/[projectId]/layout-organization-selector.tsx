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
    (item) => item.id === params.organizationId,
  );

  return (
    <Combobox
      className="w-full"
      placeholder="Select organization"
      icon={Building}
      value={organization?.id}
      items={
        organizations
          .filter((item) => item.id)
          .map((item) => ({
            label: item.name,
            value: item.id,
          })) ?? []
      }
      onChange={(value) => {
        router.push(`/${value}`);
      }}
    />
  );
}
