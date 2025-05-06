'use client';

import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import NextImage from 'next/image';
import { useState } from 'react';
import { Button } from './ui/button';

type Frame = {
  id: string;
  label: string;
  key: string;
  Component: React.ComponentType;
};

function LivePreview() {
  return (
    <iframe
      src={
        'https://dashboard.openpanel.dev/share/overview/zef2XC?header=0&range=30d'
      }
      className="w-full h-full"
      title="Live preview"
      scrolling="no"
    />
  );
}

function Image({ src }: { src: string }) {
  return (
    <div>
      <NextImage
        className="w-full h-full block dark:hidden"
        src={`/${src}-light.png`}
        alt={`${src} light`}
        width={1200}
        height={800}
      />
      <NextImage
        className="w-full h-full hidden dark:block"
        src={`/${src}-dark.png`}
        alt={`${src} dark`}
        width={1200}
        height={800}
      />
    </div>
  );
}

export function HeroCarousel() {
  const frames: Frame[] = [
    {
      id: 'overview',
      key: 'overview',
      label: 'Live preview',
      Component: LivePreview,
    },
    {
      id: 'analytics',
      key: 'analytics',
      label: 'Product analytics',
      Component: () => <Image src="dashboard" />,
    },
    {
      id: 'funnels',
      key: 'funnels',
      label: 'Funnels',
      Component: () => <Image src="funnel" />,
    },
    {
      id: 'retention',
      key: 'retention',
      label: 'Retention',
      Component: () => <Image src="retention" />,
    },
    {
      id: 'profile',
      key: 'profile',
      label: 'Inspect profile',
      Component: () => <Image src="profile" />,
    },
  ];

  const [activeFrames, setActiveFrames] = useState<Frame[]>([frames[0]]);
  const activeFrame = activeFrames[activeFrames.length - 1];

  return (
    <div className="col gap-6 w-full">
      <div className="flex-wrap row gap-x-4 gap-y-2 justify-center [&>div]:font-medium mt-1">
        {frames.map((frame) => (
          <div key={frame.id} className="relative">
            <Button
              variant="naked"
              type="button"
              onClick={() => {
                if (activeFrame.id === frame.id) {
                  return;
                }

                const newFrame = {
                  ...frame,
                  key: Math.random().toString().slice(2, 11),
                };

                setActiveFrames((p) => [...p.slice(-2), newFrame]);
              }}
              className="relative"
            >
              {frame.label}
            </Button>
            <motion.div
              className="h-1 bg-foreground rounded-full"
              initial={false}
              animate={{
                width: activeFrame.id === frame.id ? '100%' : '0%',
                opacity: activeFrame.id === frame.id ? 1 : 0,
              }}
              whileHover={{
                width: '100%',
                opacity: 0.5,
              }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
            />
          </div>
        ))}
      </div>
      <div className="pulled animated-iframe-gradient p-px pb-0 rounded-t-xl">
        <div className="overflow-hidden rounded-xl rounded-b-none w-full bg-background">
          <div
            className={cn(
              'relative w-full h-[750px]',
              activeFrame.id !== 'overview' && 'h-auto aspect-[5/3]',
            )}
          >
            {activeFrames.slice(-1).map((frame) => (
              <div key={frame.key} className="absolute inset-0 w-full h-full">
                <div className="bg-background rounded-xl h-full w-full">
                  <frame.Component />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
