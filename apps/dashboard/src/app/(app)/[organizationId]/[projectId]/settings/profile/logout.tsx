'use client';

import { buttonVariants } from '@/components/ui/button';
import { Widget, WidgetBody, WidgetHead } from '@/components/Widget';
import { SignOutButton } from '@clerk/nextjs';

export function Logout() {
  return (
    <Widget className="border-destructive">
      <WidgetHead>
        <span className="title">Sad part</span>
      </WidgetHead>
      <WidgetBody>
        <p className="mb-4">
          Sometime&apos;s you need to go. See you next time
        </p>
        <SignOutButton
          // @ts-expect-error
          className={buttonVariants({ variant: 'destructive' })}
        />
      </WidgetBody>
    </Widget>
  );
}
