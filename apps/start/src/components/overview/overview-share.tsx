import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { EyeIcon, Globe2Icon, LockIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAppParams } from '@/hooks/use-app-params';
import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';

interface OverviewShareProps {
  projectId: string;
}

export function OverviewShare({ projectId }: OverviewShareProps) {
  const { organizationId } = useAppParams();
  const trpc = useTRPC();
  const query = useQuery(
    trpc.share.overviewSettings.queryOptions(
      {
        projectId,
      },
      {
        retry: 0,
      }
    )
  );
  const data = query.data;
  const mutation = useMutation(
    trpc.share.createOverview.mutationOptions({
      onSuccess() {
        query.refetch();
      },
    })
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          icon={data?.public ? Globe2Icon : LockIcon}
          loading={query.isLoading}
          responsive
        >
          {data?.public ? 'Public' : 'Private'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          {(!data || data.public === false) && (
            <DropdownMenuItem onClick={() => pushModal('ShareOverviewModal')}>
              <Globe2Icon className="mr-2" size={16} />
              Make public
            </DropdownMenuItem>
          )}
          {data?.public && (
            <DropdownMenuItem asChild>
              <Link
                params={{ shareId: data.id }}
                to={'/share/overview/$shareId'}
              >
                <EyeIcon className="mr-2" size={16} />
                View
              </Link>
            </DropdownMenuItem>
          )}
          {data?.public && (
            <DropdownMenuItem
              onClick={() => {
                mutation.mutate({
                  organizationId,
                  projectId,
                  public: false,
                  password: null,
                });
              }}
            >
              <LockIcon className="mr-2" size={16} />
              Make private
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
