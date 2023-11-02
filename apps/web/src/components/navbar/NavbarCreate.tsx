import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useOrganizationParams } from '@/hooks/useOrganizationParams';
import { LineChart } from 'lucide-react';
import Link from 'next/link';

export function NavbarCreate() {
  const params = useOrganizationParams();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm">Create</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href={`/${params.organization}/reports`}>
              <LineChart className="mr-2 h-4 w-4" />
              <span>Create a report</span>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
