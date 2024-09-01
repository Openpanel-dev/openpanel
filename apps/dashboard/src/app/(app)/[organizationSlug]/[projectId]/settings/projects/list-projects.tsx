'use client';

import { StickyBelowHeader } from '@/app/(app)/[organizationSlug]/[projectId]/layout-sticky-below-header';
import { ClientActions } from '@/components/clients/client-actions';
import { ProjectActions } from '@/components/projects/project-actions';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tooltiper } from '@/components/ui/tooltip';
import { pushModal } from '@/modals';
import { InfoIcon, PlusIcon, PlusSquareIcon } from 'lucide-react';

import type { IServiceClientWithProject, IServiceProject } from '@openpanel/db';

interface ListProjectsProps {
  projects: IServiceProject[];
  clients: IServiceClientWithProject[];
}
export default function ListProjects({ projects, clients }: ListProjectsProps) {
  return (
    <>
      <div className="row mb-4 justify-between">
        <h1 className="text-2xl font-bold">Projects</h1>
        <Button icon={PlusIcon} onClick={() => pushModal('AddProject')}>
          <span className="max-sm:hidden">Create project</span>
          <span className="sm:hidden">Project</span>
        </Button>
      </div>
      <div className="card p-4">
        <Alert className="mb-4">
          <InfoIcon size={16} />
          <AlertTitle>What is a project</AlertTitle>
          <AlertDescription>
            A project can be a website, mobile app or any other application that
            you want to track event for. Each project can have one or more
            clients. The client is used to send events to the project.
          </AlertDescription>
        </Alert>
        <Accordion type="single" collapsible className="-mx-4">
          {projects.map((project) => {
            const pClients = clients.filter(
              (client) => client.projectId === project.id
            );
            return (
              <AccordionItem
                value={project.id}
                key={project.id}
                className="last:border-b-0"
              >
                <AccordionTrigger className="px-4">
                  <div className="flex-1 text-left">
                    {project.name}
                    <span className="ml-2 text-muted-foreground">
                      {pClients.length > 0
                        ? `(${pClients.length} clients)`
                        : 'No clients created yet'}
                    </span>
                  </div>
                  <div className="mx-4"></div>
                </AccordionTrigger>
                <AccordionContent className="px-4">
                  <ProjectActions {...project} />
                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                    {pClients.map((item) => {
                      return (
                        <div
                          className="relative rounded border border-border p-4"
                          key={item.id}
                        >
                          <div className="mb-1 font-medium">{item.name}</div>
                          <Tooltiper
                            className="text-muted-foreground"
                            content={item.id}
                          >
                            Client ID: ...{item.id.slice(-12)}
                          </Tooltiper>
                          <div className="text-muted-foreground">
                            {item.cors &&
                              item.cors !== '*' &&
                              `Website: ${item.cors}`}
                          </div>
                          <div className="absolute right-4 top-4">
                            <ClientActions {...item} />
                          </div>
                        </div>
                      );
                    })}
                    <button
                      onClick={() => {
                        pushModal('AddClient', {
                          projectId: project.id,
                        });
                      }}
                      className="flex items-center justify-center gap-4 rounded bg-muted p-4"
                    >
                      <PlusSquareIcon />
                      <div className="font-medium">New client</div>
                    </button>
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </div>
    </>
  );
}
