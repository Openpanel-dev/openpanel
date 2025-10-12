import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { EyeIcon, Globe2Icon, LockIcon } from 'lucide-react';

interface OverviewShareProps {
  projectId: string;
}

export function OverviewShare({ projectId }: OverviewShareProps) {
  const trpc = useTRPC();
  const query = useQuery(
    trpc.share.overview.queryOptions({
      projectId,
    }),
  );
  const data = query.data;
  const mutation = useMutation(
    trpc.share.createOverview.mutationOptions({
      onSuccess() {
        query.refetch();
      },
    }),
  );

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
                to={'/share/overview/$shareId'}
                params={{ shareId: data.id }}
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
