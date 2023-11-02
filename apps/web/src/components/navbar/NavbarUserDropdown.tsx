import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useOrganizationParams } from '@/hooks/useOrganizationParams';
import { User } from 'lucide-react';
import { signOut } from 'next-auth/react';
import Link from 'next/link';

export function NavbarUserDropdown() {
  const params = useOrganizationParams();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button>
          <Avatar>
            <AvatarFallback>CL</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[200px]">
        <DropdownMenuGroup>
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link href={`/${params.organization}/settings/organization`}>
              <User className="mr-2 h-4 w-4" />
              Organization
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link href={`/${params.organization}/settings/projects`}>
              <User className="mr-2 h-4 w-4" />
              Projects
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link href={`/${params.organization}/settings/clients`}>
              <User className="mr-2 h-4 w-4" />
              Clients
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link href={`/${params.organization}/settings/profile`}>
              <User className="mr-2 h-4 w-4" />
              Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-red-600 cursor-pointer"
            onClick={() => {
              signOut().catch(console.error);
            }}
          >
            <User className="mr-2 h-4 w-4" />
            Logout
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
