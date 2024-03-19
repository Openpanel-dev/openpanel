'use client';

import { api } from '@/app/_trpc/client';
import { pushModal } from '@/modals';
import { EyeIcon, Globe2Icon, LockIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import type { ShareOverview } from '@openpanel/db';

import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

interface OverviewShareProps {
  data: ShareOverview | null;
}

export function OverviewShare({ data }: OverviewShareProps) {
  const router = useRouter();
  const mutation = api.share.shareOverview.useMutation({
    onSuccess() {
      router.refresh();
    },
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button icon={data && data.public ? Globe2Icon : LockIcon} responsive>
          {data && data.public ? 'Public' : 'Private'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          {(!data || data.public === false) && (
            <DropdownMenuItem onClick={() => pushModal('ShareOverviewModal')}>
              <Globe2Icon size={16} className="mr-2" />
              Make public
            </DropdownMenuItem>
          )}
          {data?.public && (
            <DropdownMenuItem asChild>
              <Link
                href={`${process.env.NEXT_PUBLIC_DASHBOARD_URL}/share/overview/${data.id}`}
              >
                <EyeIcon size={16} className="mr-2" />
                View
              </Link>
            </DropdownMenuItem>
          )}
          {data?.public && (
            <DropdownMenuItem
              onClick={() => {
                mutation.mutate({
                  public: false,
                  projectId: data?.project_id,
                  organizationId: data?.organization_slug,
                  password: null,
                });
              }}
            >
              <LockIcon size={16} className="mr-2" />
              Make private
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
