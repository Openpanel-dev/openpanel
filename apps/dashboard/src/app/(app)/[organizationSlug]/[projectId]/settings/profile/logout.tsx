'use client';

import SignOutButton from '@/components/sign-out-button';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';

export function Logout() {
  return (
    <Widget className="border-destructive">
      <WidgetHead>
        <span className="title">Sad part</span>
      </WidgetHead>
      <WidgetBody>
        <p className="mb-4">Sometimes you need to go. See you next time</p>
        <SignOutButton />
      </WidgetBody>
    </Widget>
  );
}
