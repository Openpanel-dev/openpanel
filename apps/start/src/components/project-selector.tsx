import type { IServiceOrganization } from '@openpanel/db';
import { Link, useRouter } from '@tanstack/react-router';
import {
  Building2Icon,
  CheckIcon,
  ChevronsUpDownIcon,
  PlusIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
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
import { useAppParams } from '@/hooks/use-app-params';
import { useOrganizationAccess } from '@/hooks/use-organization-access';
import { pushModal } from '@/modals';
import { useTranslation } from 'react-i18next';

interface ProjectSelectorProps {
  projects: Array<{ id: string; name: string; organizationId: string }>;
  organizations?: IServiceOrganization[];
  align?: 'start' | 'end';
}

export default function ProjectSelector({
  projects,
  organizations,
  align = 'start',
}: ProjectSelectorProps) {
  const router = useRouter();
  const { organizationId, projectId } = useAppParams();
  const { isAdmin } = useOrganizationAccess(organizationId);
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  const changeProject = (newProjectId: string) => {
    if (organizationId && projectId) {
      // Navigate to the new project keeping the current path structure
      router.navigate({
        to: '/$organizationId/$projectId',
        params: {
          organizationId,
          projectId: newProjectId,
        },
      });
    } else {
      router.navigate({
        to: '/$organizationId/$projectId',
        params: {
          organizationId: organizationId!,
          projectId: newProjectId,
        },
      });
    }
  };

  const changeOrganization = (newOrganizationId: string) => {
    router.navigate({
      to: '/$organizationId',
      params: {
        organizationId: newOrganizationId,
      },
    });
  };

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center justify-start"
          role="combobox"
          size={'sm'}
          variant="outline"
        >
          <Building2Icon className="shrink-0" size={16} />
          <span className="mx-2 truncate">
            {projectId
              ? projects.find((p) => p.id === projectId)?.name
              : organizationId
                ? organizations?.find((o) => o.id === organizationId)?.name
                : t('projects.select_project')}
          </span>
          <ChevronsUpDownIcon className="ml-auto h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-[200px]">
        <DropdownMenuLabel>{t('projects.projects')}</DropdownMenuLabel>
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
              <Link
                params={{
                  organizationId,
                }}
                to={'/$organizationId'}
              >
                {t('projects.all_projects')}
              </Link>
            </DropdownMenuItem>
          )}
          {isAdmin && (
            <DropdownMenuItem
              className="text-emerald-600"
              onClick={() => {
                pushModal('AddProject');
              }}
            >
              {t('projects.create_new_project')}
              <DropdownMenuShortcut>
                <PlusIcon size={16} />
              </DropdownMenuShortcut>
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        {!!organizations && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t('projects.organizations')}</DropdownMenuLabel>
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
              <DropdownMenuItem asChild>
                <Link to={'/onboarding/project'}>
                  {t('projects.new_organization')}
                  <DropdownMenuShortcut>
                    <PlusIcon size={16} />
                  </DropdownMenuShortcut>
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
