'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CheckIcon, MoreHorizontalIcon, PlusIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import * as React from 'react';

import { ProjectLink } from './links';

interface Props {
  className?: string;
}

export default function SettingsToggle({ className }: Props) {
  const { setTheme, theme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className={className}>
          <MoreHorizontalIcon className="h-[1.2rem] w-[1.2rem]" />
          <span className="sr-only">Toggle settings</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-56">
        <DropdownMenuItem asChild>
          <ProjectLink href="/reports">
            Create report
            <DropdownMenuShortcut>
              <PlusIcon className="h-4 w-4" />
            </DropdownMenuShortcut>
          </ProjectLink>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Settings</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <ProjectLink href="/settings/organization">Organization</ProjectLink>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <ProjectLink href="/settings/projects">Projects</ProjectLink>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <ProjectLink href="/settings/profile">Your profile</ProjectLink>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <ProjectLink href="/settings/references">References</ProjectLink>
        </DropdownMenuItem>
        {/* <DropdownMenuItem asChild>
          <ProjectLink href="/settings/notifications">
            Notifications
          </ProjectLink>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <ProjectLink href="/settings/integrations">Integrations</ProjectLink>
        </DropdownMenuItem> */}
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="flex w-full items-center justify-between">
            Theme
            <DropdownMenuShortcut>{theme}</DropdownMenuShortcut>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="p-0">
            {['system', 'light', 'dark'].map((themeOption) => (
              <DropdownMenuItem
                key={themeOption}
                onClick={() => setTheme(themeOption)}
                className="capitalize"
              >
                {themeOption}
                {theme === themeOption && (
                  <CheckIcon className="ml-2 h-4 w-4" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-red-600">Logout</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
