'use client';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/utils/cn';
// import { StarIcon } from 'lucide-react';
import Image from 'next/image';

interface JoinWaitlistProps {
  className?: string;
  count: number;
}

export function SocialProof({ className, count }: JoinWaitlistProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex">
        <Tooltip>
          <TooltipTrigger>
            <Image
              className="rounded-full"
              src="/clickhouse.png"
              width={40}
              height={40}
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
              width={40}
              height={40}
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
              width={40}
              height={40}
              alt="KiddoKitchen"
            />
          </TooltipTrigger>
          <TooltipContent>KiddoKitchen is here</TooltipContent>
        </Tooltip>
      </div>
      <div>
        <p className="text-left">{count} early birds have signed up! 🚀</p>
        {/* <div className="flex gap-0.5">
          <StarIcon size={16} color="#F5C962" fill="#F5C962" />
          <StarIcon size={16} color="#F5C962" fill="#F5C962" />
          <StarIcon size={16} color="#F5C962" fill="#F5C962" />
          <StarIcon size={16} color="#F5C962" fill="#F5C962" />
          <StarIcon size={16} color="#F5C962" fill="#F5C962" />
        </div> */}
      </div>
    </div>
  );
}

// <div class="flex flex-col gap-y-2 mt-5 lg:mt-3"><p class="text-gray-700 dark:text-gray-100 text-sm w-24 text-start font-semibold whitespace-nowrap">What users think</p><div class="flex flex-row w-full gap-x-2 items-start"><div class="w-5 shrink-0"/><img class="w-5 h-5 rounded-full " src="https://pbs.twimg.com/profile_images/1744063824431370240/BbVtyCiy_normal.png" alt="feedback_0"><span class="flex-wrap text-sm text-gray-600 dark:text-gray-200 text-start font-normal">“ Been a long time Mixpanel user and without a doubt there's a bunch of room to innovate. I'm confident Openpanel is on the right path! ”</span/><div class="flex flex-row w-full gap-x-2 items-start"><div class="w-5 shrink-0"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-flame w-5 h-5 text-red-600 fill-orange-400 animate-pulse"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></svg/><img class="w-5 h-5 rounded-full border border-2 border-red-500" src="https://pbs.twimg.com/profile_images/1751607056316944384/8E4F88FL_normal.jpg" alt="feedback_1"><span class="flex-wrap text-sm text-gray-600 dark:text-gray-200 text-start font-normal">“ I have used Openpanel for the last 6 months (since I’m the creator) for 3 different sites/apps. It’s a great analytics product that has everything you need. Still lacking a native app but will work hard to make that a reality!  ”</span/><div class="flex flex-row w-full gap-x-2 items-start"><div class="w-5 shrink-0"/><img class="w-5 h-5 rounded-full " src="https://pbs.twimg.com/profile_images/1701887174042324992/g2GBIQay_normal.jpg" alt="feedback_2"><span class="flex-wrap text-sm text-gray-600 dark:text-gray-200 text-start font-normal">“ would be cool if it was easier to edit text after image is generated  ”</span/><div class="flex flex-row w-full gap-x-2 items-start"><div class="w-5 shrink-0"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-flame w-5 h-5 text-red-600 fill-orange-400 animate-pulse"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></svg/><img class="w-5 h-5 rounded-full border border-2 border-red-500" src="https://pbs.twimg.com/profile_images/1194368464946974728/1D2biimN_normal.jpg" alt="feedback_3"><span class="flex-wrap text-sm text-gray-600 dark:text-gray-200 text-start font-normal">“ Awesome product, very easy to use and understand. I miss a native app and the documentation could be improved. Otherwise I love it. ”</span/><div class="flex flex-row w-full gap-x-2 items-start"><div class="w-5 shrink-0"/><img class="w-5 h-5 rounded-full " src="https://lh3.googleusercontent.com/a/ACg8ocIWiGTd3nWE5etp-CFhxrTKFvSLSJJd7pPmiM9SNJ9sAg=s96-c" alt="feedback_4"><span class="flex-wrap text-sm text-gray-600 dark:text-gray-200 text-start font-normal">“ I have used Open panel since the private beta and i'm super impressed by the product already, the speed after you give feedback to actually get the features is truly amazing! Can't wait to see where Openpanel are in 6 months! ”</span/><div class="flex flex-row w-full gap-x-2 items-start"><div class="w-5 shrink-0"/><img class="w-5 h-5 rounded-full " src="https://lh3.googleusercontent.com/a/ACg8ocKymAw_YoIrfoGp-bWMlDsXgM6St0dzaVJ7m_lGNXDtrA=s96-c" alt="feedback_5"><span class="flex-wrap text-sm text-gray-600 dark:text-gray-200 text-start font-normal">“ Impressively fast UI and easy to integrate! Added it alongside my current analytics tool for my native app in less than an hour.  ”</span/><div class="flex flex-row w-full gap-x-2 items-start"><div class="w-5 shrink-0"/><img class="w-5 h-5 rounded-full " src="https://pbs.twimg.com/profile_images/1735771119980879872/Mx5MlB9e_normal.jpg" alt="feedback_6"><span class="flex-wrap text-sm text-gray-600 dark:text-gray-200 text-start font-normal">“ Im using plausible and find it pleasing but limited.
//  Im looking forward to trying out Openpanel, the demo pictures and the page look professional. The listed features seem to be broader then plausible. :) ”</span/><div class="flex flex-row w-full gap-x-2 items-start"><div class="w-5 shrink-0"/><img class="w-5 h-5 rounded-full " src="https://pbs.twimg.com/profile_images/1767459527006334976/unbMENPG_normal.jpg" alt="feedback_7"><span class="flex-wrap text-sm text-gray-600 dark:text-gray-200 text-start font-normal">“ Incredibly easy to implement and a joy to use. 5/5 would recommend. ”</span/></div>
