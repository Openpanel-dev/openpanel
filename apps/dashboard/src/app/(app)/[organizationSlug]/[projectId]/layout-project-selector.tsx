'use client';

import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAppParams } from '@/hooks/useAppParams';
import { pushModal } from '@/modals';
import {
  Building2Icon,
  CheckIcon,
  ChevronsUpDownIcon,
  PlusIcon,
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

import type {
  getOrganizations,
  getProjectsByOrganizationId,
} from '@openpanel/db';
import Link from 'next/link';

interface LayoutProjectSelectorProps {
  projects: Awaited<ReturnType<typeof getProjectsByOrganizationId>>;
  organizations?: Awaited<ReturnType<typeof getOrganizations>>;
  align?: 'start' | 'end';
}
export default function LayoutProjectSelector({
  projects,
  organizations,
  align = 'start',
}: LayoutProjectSelectorProps) {
  const router = useRouter();
  const { organizationId, projectId } = useAppParams();
  const pathname = usePathname() || '';
  const [open, setOpen] = useState(false);

  const changeProject = (newProjectId: string) => {
    if (organizationId && projectId) {
      const split = pathname
        .replace(
          `/${organizationId}/${projectId}`,
          `/${organizationId}/${newProjectId}`,
        )
        .split('/');
      // slicing here will remove everything after /{orgId}/{projectId}/dashboards [slice here] /xxx/xxx/xxx
      router.push(split.slice(0, 4).join('/'));
    } else {
      router.push(`/${organizationId}/${newProjectId}`);
    }
  };

  const changeOrganization = (newOrganizationId: string) => {
    router.push(`/${newOrganizationId}`);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          size={'sm'}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center justify-start"
        >
          <Building2Icon size={16} className="shrink-0" />
          <span className="mx-2 truncate">
            {projectId
              ? projects.find((p) => p.id === projectId)?.name
              : organizationId
                ? organizations?.find((o) => o.id === organizationId)?.name
                : 'Select project'}
          </span>
          <ChevronsUpDownIcon className="ml-auto h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-[200px]">
        <DropdownMenuLabel>Projects</DropdownMenuLabel>
        <DropdownMenuGroup>
          {projects.slice(0, 10).map((project) => (
            <DropdownMenuItem
              key={project.id}
              onClick={() => changeProject(project.id)}
            >
              {project.name}
              {project.id === projectId && (
                <DropdownMenuShortcut>
                  <CheckIcon size={16} />
                </DropdownMenuShortcut>
              )}
            </DropdownMenuItem>
          ))}
          {projects.length > 10 && (
            <DropdownMenuItem asChild>
              <Link href={`/${organizationId}`}>All projects</Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            className="text-emerald-600"
            onClick={() => pushModal('AddProject')}
          >
            Create new project
            <DropdownMenuShortcut>
              <PlusIcon size={16} />
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        {!!organizations && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Organizations</DropdownMenuLabel>
            <DropdownMenuGroup>
              {organizations.map((organization) => (
                <DropdownMenuItem
                  key={organization.id}
                  onClick={() => changeOrganization(organization.id)}
                >
                  {organization.name}
                  {organization.id === organizationId && (
                    <DropdownMenuShortcut>
                      <CheckIcon size={16} />
                    </DropdownMenuShortcut>
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>
                New organization
                <DropdownMenuShortcut>
                  <PlusIcon size={16} />
                </DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
