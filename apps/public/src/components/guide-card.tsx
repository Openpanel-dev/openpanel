import Image from 'next/image';
import Link from 'next/link';

const difficultyColors = {
  beginner: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  intermediate:
    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  advanced: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

const difficultyLabels = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

export function GuideCard({
  url,
  title,
  difficulty,
  timeToComplete,
  cover,
  team,
  date,
}: {
  url: string;
  title: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  timeToComplete: number;
  cover: string;
  team?: string;
  date: Date;
}) {
  return (
    <Link
      className="col overflow-hidden rounded-lg border bg-background-light transition-all duration-300 hover:scale-105 hover:shadow-background-dark hover:shadow-lg"
      href={url}
      key={url}
    >
      <Image
        alt={title}
        className="w-full"
        height={181}
        src={cover}
        width={323}
      />
      <span className="col flex-1 p-4">
        <div className="mb-2 flex items-center gap-2">
          <span
            className={`rounded px-2 py-1 font-mono text-xs ${difficultyColors[difficulty]}`}
          >
            {difficultyLabels[difficulty]}
          </span>
          <span className="text-muted-foreground text-xs">
            {timeToComplete} min
          </span>
        </div>
        <span className="mb-6 flex-1">
          <h2 className="font-semibold text-xl">{title}</h2>
        </span>
        <p className="text-muted-foreground text-sm">
          {[team, date.toLocaleDateString()].filter(Boolean).join(' · ')}
        </p>
      </span>
    </Link>
  );
}
