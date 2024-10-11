'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { pushModal } from '@/modals';
import { api } from '@/trpc/client';
import { EyeIcon, Globe2Icon, LockIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import type { ShareOverview } from '@openpanel/db';

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
        <Button icon={data?.public ? Globe2Icon : LockIcon} responsive>
          {data?.public ? 'Public' : 'Private'}
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
                  ...data,
                  public: false,
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
