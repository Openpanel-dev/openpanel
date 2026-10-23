import type {
  NavigateInput,
  OpenDialogInput,
} from '@openpanel/core/modules/assistant/assistant.constants';
import {
  CHAT_DIALOGS,
  CHAT_ROUTES,
} from '@openpanel/core/modules/assistant/assistant.constants';
import { Link } from '@tanstack/react-router';
import { ArrowRightIcon, BookOpenIcon, PlusIcon, UserIcon } from 'lucide-react';
import { openDialog } from '../use-chat-session';

export function NavigateCard({
  input,
  output,
}: {
  input: NavigateInput;
  output?: { opened?: string };
}) {
  const route = CHAT_ROUTES[input.route];
  const href = output?.opened;
  const label = input.reason ?? `Open ${route?.label ?? input.route}`;
  if (!href) {
    return null;
  }
  return (
    <Link
      className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 font-medium text-sm transition-colors hover:bg-muted/60"
      to={href}
    >
      {label}
      <ArrowRightIcon className="size-3.5 text-muted-foreground" />
    </Link>
  );
}

export function DialogCard({ input }: { input: OpenDialogInput }) {
  const label = CHAT_DIALOGS[input.dialog]?.label ?? input.dialog;
  return (
    <button
      className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 font-medium text-sm transition-colors hover:bg-muted/60"
      onClick={() => openDialog(input)}
      type="button"
    >
      <PlusIcon className="size-3.5 text-muted-foreground" />
      {label}
    </button>
  );
}

interface DocResult {
  title: string;
  url: string;
}

export function DocsCard({ results }: { results: DocResult[] }) {
  if (results.length === 0) {
    return null;
  }
  return (
    <div className="rounded-xl border bg-card px-4 py-2 text-sm">
      <div className="mb-1 text-muted-foreground text-xs">From the docs</div>
      <ul className="space-y-1">
        {results.map((result) => (
          <li key={result.url}>
            <a
              className="inline-flex items-center gap-1.5 hover:underline"
              href={result.url}
              rel="noopener noreferrer"
              target="_blank"
            >
              <BookOpenIcon className="size-3.5 text-muted-foreground" />
              {result.title}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface ProfileHit {
  id: string;
  email?: string;
  name?: string;
  url: string;
}

export function SearchCard({
  profiles,
  session,
  eventNames,
}: {
  profiles: ProfileHit[];
  session: { url: string } | null;
  eventNames: string[];
}) {
  const empty = profiles.length === 0 && !session && eventNames.length === 0;
  if (empty) {
    return (
      <div className="rounded-xl border bg-card px-4 py-2 text-muted-foreground text-sm">
        Nothing matched.
      </div>
    );
  }
  return (
    <div className="rounded-xl border bg-card px-4 py-2 text-sm">
      {profiles.length > 0 && (
        <ul className="space-y-1">
          {profiles.map((profile) => (
            <li key={profile.id}>
              <a
                className="inline-flex items-center gap-1.5 hover:underline"
                href={profile.url}
              >
                <UserIcon className="size-3.5 text-muted-foreground" />
                {profile.name || profile.email || profile.id}
                {profile.email && profile.name && (
                  <span className="text-muted-foreground">{profile.email}</span>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
      {session && (
        <a
          className="mt-1 inline-flex items-center gap-1.5 hover:underline"
          href={session.url}
        >
          <ArrowRightIcon className="size-3.5 text-muted-foreground" />
          Open session
        </a>
      )}
      {eventNames.length > 0 && (
        <div className="mt-1 text-muted-foreground">
          Events: {eventNames.join(', ')}
        </div>
      )}
    </div>
  );
}

export function PlanChangeCard({
  output,
}: {
  output: { checkoutUrl?: string; changed?: boolean };
}) {
  if (output.checkoutUrl) {
    return (
      <a
        className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 font-medium text-sm transition-colors hover:bg-muted/60"
        href={output.checkoutUrl}
        rel="noopener noreferrer"
        target="_blank"
      >
        Continue to checkout
        <ArrowRightIcon className="size-3.5 text-muted-foreground" />
      </a>
    );
  }
  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-sm">
      Plan changed. Billing is prorated from today.
    </div>
  );
}
