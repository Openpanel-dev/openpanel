import { MessagesSquareIcon, PencilIcon } from 'lucide-react';

export function DocsTocFooter({ githubUrl }: { githubUrl: string }) {
  return (
    <div className="col mt-6 gap-2 border-black/6 border-t pt-4 text-neutral-500 text-xs">
      <a
        className="row items-center gap-1.5 transition-colors hover:text-neutral-900"
        href={githubUrl}
        rel="noopener"
        target="_blank"
      >
        <PencilIcon className="size-3" />
        Edit this page on GitHub
      </a>
      <a
        className="row items-center gap-1.5 transition-colors hover:text-neutral-900"
        href="https://go.openpanel.dev/discord"
        rel="noopener"
        target="_blank"
      >
        <MessagesSquareIcon className="size-3" />
        Ask on Discord
      </a>
    </div>
  );
}
