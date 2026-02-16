import { Link, useNavigate } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronDownIcon,
  CogIcon,
  CreditCardIcon,
  LayoutListIcon,
  PlusIcon,
  UsersIcon,
  WorkflowIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from './ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/hooks/use-app-context';
import { pushModal } from '@/modals';
import type { RouterOutputs } from '@/trpc/client';
import { cn } from '@/utils/cn';

export default function SidebarOrganizationMenu({
  organization,
}: {
  organization: RouterOutputs['organization']['list'][number];
}) {
  const { isSelfHosted } = useAppContext();

  return (
    <>
      <Link
        activeOptions={{ exact: true }}
        className={cn(
          'flex items-center gap-2 rounded-md px-3 py-2 font-medium text-[13px] transition-all hover:bg-def-200'
        )}
        from="/$organizationId"
        to="/$organizationId"
      >
        <LayoutListIcon size={20} />
        <div className="flex-1">Projects</div>
      </Link>
      <Link
        activeOptions={{ exact: true }}
        className={cn(
          'flex items-center gap-2 rounded-md px-3 py-2 font-medium text-[13px] transition-all hover:bg-def-200'
        )}
        from="/$organizationId"
        to="/$organizationId/settings"
      >
        <CogIcon size={20} />
        <div className="flex-1">Settings</div>
      </Link>
      {!isSelfHosted && (
        <Link
          activeOptions={{ exact: true }}
          className={cn(
            'flex items-center gap-2 rounded-md px-3 py-2 font-medium text-[13px] transition-all hover:bg-def-200'
          )}
          from="/$organizationId"
          to="/$organizationId/billing"
        >
          <CreditCardIcon size={20} />
          <div className="flex-1">Billing</div>
          {organization?.isTrial && <Badge>Trial</Badge>}
          {organization?.isExpired && <Badge>Expired</Badge>}
          {organization?.isWillBeCanceled && <Badge>Canceled</Badge>}
          {organization?.isCanceled && <Badge>Canceled</Badge>}
        </Link>
      )}
      <Link
        className={cn(
          'flex items-center gap-2 rounded-md px-3 py-2 font-medium text-[13px] transition-all hover:bg-def-200'
        )}
        from="/$organizationId"
        to="/$organizationId/members"
      >
        <UsersIcon size={20} />
        <div className="flex-1">Members</div>
      </Link>
      <Link
        className={cn(
          'flex items-center gap-2 rounded-md px-3 py-2 font-medium text-[13px] transition-all hover:bg-def-200'
        )}
        from="/$organizationId"
        to="/$organizationId/integrations"
      >
        <WorkflowIcon size={20} />
        <div className="flex-1">Integrations</div>
      </Link>
    </>
  );
}

export function ActionCTAButton() {
  const navigate = useNavigate();

  const ACTIONS = [
    {
      label: 'Create a project',
      icon: PlusIcon,
      onClick: () => pushModal('AddProject'),
    },
    {
      label: 'Invite a user',
      icon: UsersIcon,
      onClick: () => pushModal('CreateInvite'),
    },
    {
      label: 'Add integration',
      icon: WorkflowIcon,
      onClick: () =>
        navigate({
          to: '/$organizationId/integrations',
          from: '/$organizationId',
        }),
    },
  ];

  const [currentActionIndex, setCurrentActionIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentActionIndex((prevIndex) => (prevIndex + 1) % ACTIONS.length);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mb-4">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="w-full justify-between" size="default">
            <div className="flex items-center gap-2">
              <PlusIcon size={16} />
              <div className="relative flex h-5 items-center">
                <AnimatePresence mode="popLayout">
                  <motion.span
                    animate={{ y: 0, opacity: 1 }}
                    className="absolute whitespace-nowrap"
                    exit={{ y: -20, opacity: 0 }}
                    initial={{ y: 20, opacity: 0 }}
                    key={currentActionIndex}
                    transition={{
                      type: 'spring',
                      stiffness: 300,
                      damping: 25,
                      duration: 0.3,
                    }}
                  >
                    {ACTIONS[currentActionIndex].label}
                  </motion.span>
                </AnimatePresence>
              </div>
            </div>
            <ChevronDownIcon size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {ACTIONS.map((action) => (
            <DropdownMenuItem
              className="cursor-pointer"
              key={action.label}
              onClick={action.onClick}
            >
              <action.icon className="mr-2 h-4 w-4" />
              {action.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
