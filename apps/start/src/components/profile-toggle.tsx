import { Button } from '@/components/ui/button';
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
import { useTheme } from '@/hooks/use-theme';
import { CheckIcon, UserIcon } from 'lucide-react';

import { useLogout } from '@/hooks/use-logout';
import { themeConfig } from './theme-provider';

interface Props {
  className?: string;
}

export function ProfileToggle({ className }: Props) {
  const { setTheme, userTheme, themes } = useTheme();
  const logout = useLogout();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className={className}>
          <UserIcon className="size-4" />
          <span className="sr-only">Profile</span>
        </Button>
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
                key={themeOption.key}
                onClick={() => setTheme(themeOption.key)}
                className="capitalize"
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
