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
import { useTranslation } from 'react-i18next';

interface OverviewShareProps {
  projectId: string;
}

export function OverviewShare({ projectId }: OverviewShareProps) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const query = useQuery(
    trpc.share.overview.queryOptions(
      {
        projectId,
      },
      {
        retry: 0,
      },
    ),
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
        <Button
          icon={data?.public ? Globe2Icon : LockIcon}
          responsive
          loading={query.isLoading}
        >
          {data?.public ? t('overview.public') : t('overview.private')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          {(!data || data.public === false) && (
            <DropdownMenuItem onClick={() => pushModal('ShareOverviewModal')}>
              <Globe2Icon size={16} className="mr-2" />
              {t('overview.make_public')}
            </DropdownMenuItem>
          )}
          {data?.public && (
            <DropdownMenuItem asChild>
              <Link
                to={'/share/overview/$shareId'}
                params={{ shareId: data.id }}
              >
                <EyeIcon size={16} className="mr-2" />
                {t('overview.view')}
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
              {t('overview.make_private')}
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
