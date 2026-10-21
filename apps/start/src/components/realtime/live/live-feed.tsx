import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDownIcon } from 'lucide-react';
import { useStoredToggle } from './use-stored-toggle';
import { ProjectLink } from '@/components/links';
import { cn } from '@/utils/cn';

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

export function formatAge(date: Date, now: number) {
  const seconds = Math.max(
    0,
    Math.round((now - new Date(date).getTime()) / 1000)
  );
  if (seconds < SECONDS_PER_MINUTE) {
    return 'now';
  }
  if (seconds < SECONDS_PER_HOUR) {
    return `${Math.floor(seconds / SECONDS_PER_MINUTE)}m`;
  }
  return `${Math.floor(seconds / SECONDS_PER_HOUR)}h`;
}

export function LiveFeed<T extends { id: string }>({
  title,
  storageKey,
  items,
  renderItem,
  className,
}: {
  title: string;
  /** Remembers per browser whether this feed is shown. */
  storageKey: string;
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  className?: string;
}) {
  const [isOpen, toggleOpen] = useStoredToggle(
    `realtime-feed-${storageKey}-open`,
    true
  );

  return (
    <section
      aria-label={title}
      className={cn(
        'flex min-h-0 flex-col gap-2 overflow-hidden',
        isOpen &&
          'flex-1 [mask-image:linear-gradient(to_bottom,black_55%,transparent)]',
        className
      )}
    >
      <h2>
        <button
          aria-expanded={isOpen}
          className="pointer-events-auto flex items-center gap-1 font-medium text-2xs text-muted-foreground uppercase tracking-widest transition-colors hover:text-foreground"
          onClick={toggleOpen}
          title={
            isOpen
              ? `Hide ${title.toLowerCase()}`
              : `Show ${title.toLowerCase()}`
          }
          type="button"
        >
          {title}
          <ChevronDownIcon
            className={cn(
              'size-3 transition-transform',
              isOpen ? 'rotate-0' : '-rotate-90'
            )}
          />
        </button>
      </h2>
      {isOpen ? (
        <ul className="flex flex-col gap-1">
          <AnimatePresence initial={false}>
            {items.map((item) => (
              <motion.li
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                initial={{ opacity: 0, y: -10, scale: 0.97 }}
                key={item.id}
                layout="position"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              >
                {renderItem(item)}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      ) : null}
    </section>
  );
}

export function LiveFeedItem({
  sessionId,
  icon,
  title,
  detail,
  trailing,
}: {
  sessionId: string;
  icon: React.ReactNode;
  title: string;
  detail?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <ProjectLink
      className="pointer-events-auto flex h-7 items-center gap-2 rounded-md border bg-card/70 px-2 text-xs backdrop-blur-md transition-colors hover:bg-card"
      params={{ sessionId }}
      to="/sessions/$sessionId"
    >
      <span className="flex size-4 shrink-0 items-center justify-center">
        {icon}
      </span>
      <span className="max-w-[55%] shrink-0 truncate font-medium">{title}</span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        {detail}
      </span>
      {trailing ? (
        <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground tabular-nums">
          {trailing}
        </span>
      ) : null}
    </ProjectLink>
  );
}
