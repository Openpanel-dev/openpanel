import {
  BoxSelectIcon,
  BuildingIcon,
  CogIcon,
  CreditCardIcon,
  LayoutListIcon,
  UsersIcon,
  WorkflowIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useAppParams } from '@/hooks/use-app-params';
import { cn } from '@/utils/cn';
// import { pushModal } from '@/modals';
import { Link, useNavigate } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDownIcon, PlusIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

export default function SidebarOrganizationMenu() {
  return (
    <>
      <Link
        className={cn(
          'flex items-center gap-2 rounded-md px-3 py-2 font-medium transition-all hover:bg-def-200 text-[13px]',
        )}
        to="/$organizationId"
        from="/$organizationId"
      >
        <LayoutListIcon size={20} />
        <div className="flex-1">Projects</div>
      </Link>
      <Link
        className={cn(
          'flex items-center gap-2 rounded-md px-3 py-2 font-medium transition-all hover:bg-def-200 text-[13px]',
        )}
        to="/$organizationId/settings"
        from="/$organizationId"
      >
        <CogIcon size={20} />
        <div className="flex-1">Settings</div>
      </Link>
      <Link
        className={cn(
          'flex items-center gap-2 rounded-md px-3 py-2 font-medium transition-all hover:bg-def-200 text-[13px]',
        )}
        to="/$organizationId/billing"
        from="/$organizationId"
      >
        <CreditCardIcon size={20} />
        <div className="flex-1">Billing</div>
      </Link>
      <Link
        className={cn(
          'flex items-center gap-2 rounded-md px-3 py-2 font-medium transition-all hover:bg-def-200 text-[13px]',
        )}
        to="/$organizationId/members"
        from="/$organizationId"
      >
        <UsersIcon size={20} />
        <div className="flex-1">Members</div>
      </Link>
      <Link
        className={cn(
          'flex items-center gap-2 rounded-md px-3 py-2 font-medium transition-all hover:bg-def-200 text-[13px]',
        )}
        to="/$organizationId/integrations"
        from="/$organizationId"
      >
        <WorkflowIcon size={20} />
        <div className="flex-1">Integrations</div>
      </Link>
    </>
  );
}

export function ActionCTAButton() {
  const { organizationId, projectId } = useAppParams();
  const navigate = useNavigate();

  const handleCreateProject = useCallback(() => {
    if (organizationId) {
      navigate({ to: `/${organizationId}/projects` });
    }
  }, [organizationId, navigate]);

  const ACTIONS = ['Create a project'];

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
              <div className="relative h-5 flex items-center">
                <AnimatePresence mode="popLayout">
                  <motion.span
                    key={currentActionIndex}
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -20, opacity: 0 }}
                    transition={{
                      type: 'spring',
                      stiffness: 300,
                      damping: 25,
                      duration: 0.3,
                    }}
                    className="absolute whitespace-nowrap"
                  >
                    {ACTIONS[currentActionIndex]}
                  </motion.span>
                </AnimatePresence>
              </div>
            </div>
            <ChevronDownIcon size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="start">
          <DropdownMenuItem
            onClick={handleCreateProject}
            className="cursor-pointer"
          >
            <PlusIcon className="mr-2 h-4 w-4" />
            Create a project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
