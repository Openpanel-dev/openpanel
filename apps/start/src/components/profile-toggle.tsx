import { useParams, useRouter } from '@tanstack/react-router';
import { CheckIcon, UserIcon } from 'lucide-react';
import { themeConfig } from './theme-provider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLogout } from '@/hooks/use-logout';
import { useTheme } from '@/hooks/use-theme';
import {
  TranslationText as DashboardText,
  useTranslation,
} from '@/i18n/provider';
import { cn } from '@/lib/utils';

interface Props {
  className?: string;
}

export function ProfileToggle({ className }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const { organizationId } = useParams({ strict: false });
  const { setTheme, userTheme, themes } = useTheme();
  const logout = useLogout();

  const goToAccount = () => {
    if (organizationId) {
      router.navigate({
        to: '/$organizationId/account',
        params: { organizationId },
      });
      return;
    }
    router.navigate({ to: '/account' });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={cn('outline-0', className)} type="button">
          <UserIcon className="size-4" />
          <span className="sr-only">
            <DashboardText i18nKey={'Profile'} />
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-56">
        <DropdownMenuItem onClick={goToAccount}>
          <DashboardText i18nKey={'Account'} />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="flex w-full items-center justify-between">
            <DashboardText i18nKey={'Theme'} />{' '}
            <DropdownMenuShortcut>
              <span className="mr-2">{themeConfig[userTheme].icon}</span>
              {t(themeConfig[userTheme].label)}
            </DropdownMenuShortcut>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="p-0">
            {themes.map((themeOption) => (
              <DropdownMenuItem
                className="capitalize"
                key={themeOption.key}
                onClick={() => setTheme(themeOption.key)}
              >
                <span className="mr-2">{themeOption.icon}</span>
                {t(themeOption.label)}
                {userTheme === themeOption.key && (
                  <CheckIcon className="ml-2 h-4 w-4" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-red-600"
          onClick={() => logout.mutate()}
        >
          <DashboardText i18nKey={'Logout'} />{' '}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
