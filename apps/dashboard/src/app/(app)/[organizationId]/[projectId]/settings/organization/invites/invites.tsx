'use client';

import { Dot } from '@/components/dot';
import { TooltipComplete } from '@/components/tooltip-complete';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Widget, WidgetHead } from '@/components/widget';
import { cn } from '@/utils/cn';

import type { IServiceInvite, IServiceProject } from '@openpanel/db';

import CreateInvite from './create-invite';

interface Props {
  invites: IServiceInvite[];
  projects: IServiceProject[];
}

const Invites = ({ invites, projects }: Props) => {
  return (
    <Widget>
      <WidgetHead className="flex items-center justify-between">
        <span className="title">Invites</span>
        <CreateInvite projects={projects} />
      </WidgetHead>
      <Table className="mini">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Access</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invites.map((item) => {
            return <Item {...item} projects={projects} key={item.id} />;
          })}
        </TableBody>
      </Table>
    </Widget>
  );
};

interface ItemProps extends IServiceInvite {
  projects: IServiceProject[];
}

function Item({
  id,
  email,
  role,
  createdAt,
  projects,
  publicMetadata,
  status,
}: ItemProps) {
  const access = (publicMetadata?.access ?? []) as string[];
  return (
    <TableRow key={id}>
      <TableCell className="font-medium">{email}</TableCell>
      <TableCell>{role}</TableCell>
      <TableCell>
        <TooltipComplete content={new Date(createdAt).toLocaleString()}>
          {new Date(createdAt).toLocaleDateString()}
        </TooltipComplete>
      </TableCell>
      <TableCell className="capitalize flex items-center gap-2">
        <Dot
          className={cn(
            status === 'accepted' && 'bg-emerald-600',
            status === 'revoked' && 'bg-red-600',
            status === 'pending' && 'bg-orange-600'
          )}
          animated={status === 'pending'}
        />
        {status}
      </TableCell>
      <TableCell>
        {access.map((id) => {
          const project = projects.find((p) => p.id === id);
          if (!project) {
            return (
              <Badge key={id} className="mr-1">
                Unknown
              </Badge>
            );
          }
          return (
            <Badge key={id} color="blue" className="mr-1">
              {project.name}
            </Badge>
          );
        })}
        {access.length === 0 && (
          <Badge variant={'secondary'}>All projects</Badge>
        )}
      </TableCell>
    </TableRow>
  );
}

export default Invites;
