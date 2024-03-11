'use client';

import { Widget, WidgetBody, WidgetHead } from '@/components/Widget';
import { SignOutButton } from '@clerk/nextjs';

export function Logout() {
  return (
    <Widget className="border-destructive">
      <WidgetHead className="border-destructive">
        <span className="title text-destructive">Sad part</span>
      </WidgetHead>
      <WidgetBody>
        <p className="mb-4">
          Sometime&apos;s you need to go. See you next time
        </p>
        <SignOutButton />
      </WidgetBody>
    </Widget>
  );
}
