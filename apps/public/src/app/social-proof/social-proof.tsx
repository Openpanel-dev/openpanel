'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/utils/cn';
import Image from 'next/image';

interface JoinWaitlistProps {
  className?: string;
  count: number;
}

export function SocialProof({ className, count }: JoinWaitlistProps) {
  return (
    <div className={cn('flex gap-2 justify-center items-center', className)}>
      <div className="flex">
        <Tooltip>
          <TooltipTrigger>
            <Image
              className="rounded-full"
              src="/clickhouse.png"
              width={24}
              height={24}
              alt="Clickhouse"
            />
          </TooltipTrigger>
          <TooltipContent>Clickhouse is here</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger className="-mx-3">
            <Image
              className="rounded-full"
              src="/getdreams.png"
              width={24}
              height={24}
              alt="GetDreams"
            />
          </TooltipTrigger>
          <TooltipContent>GetDreams is here</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger>
            <Image
              className="rounded-full"
              src="/kiddokitchen.png"
              width={24}
              height={24}
              alt="KiddoKitchen"
            />
          </TooltipTrigger>
          <TooltipContent>KiddoKitchen is here</TooltipContent>
        </Tooltip>
      </div>
      <p className="text-white">
        {count} early birds have already signed up! 🚀
      </p>
    </div>
  );
}
