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
import { cn } from '@/lib/utils';

interface Props {
  className?: string;
}

export function ProfileToggle({ className }: Props) {
  const { setTheme, userTheme, themes } = useTheme();
  const logout = useLogout();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(className, 'center-center outline-0')}
          type="button"
        >
          <UserIcon className="size-4" />
          <span className="sr-only">Profile</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-56">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="flex w-full items-center justify-between">
            Theme
            <DropdownMenuShortcut>
              <span className="mr-2">{themeConfig[userTheme].icon}</span>
              {themeConfig[userTheme].label}
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
                {themeOption.label}
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
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
