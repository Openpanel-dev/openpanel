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
      href={url}
      key={url}
      className="border rounded-lg overflow-hidden bg-background-light col hover:scale-105 transition-all duration-300 hover:shadow-lg hover:shadow-background-dark"
    >
      <Image
        src={cover}
        alt={title}
        width={323}
        height={181}
        className="w-full"
      />
      <span className="p-4 col flex-1">
        <div className="flex items-center gap-2 mb-2">
          <span
            className={`font-mono text-xs px-2 py-1 rounded ${difficultyColors[difficulty]}`}
          >
            {difficultyLabels[difficulty]}
          </span>
          <span className="text-xs text-muted-foreground">
            {timeToComplete} min
          </span>
        </div>
        <span className="flex-1 mb-6">
          <h2 className="text-xl font-semibold">{title}</h2>
        </span>
        <p className="text-sm text-muted-foreground">
          {[team, date.toLocaleDateString()].filter(Boolean).join(' · ')}
        </p>
      </span>
    </Link>
  );
}
