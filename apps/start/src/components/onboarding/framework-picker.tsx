import { type Framework, frameworks } from '@openpanel/sdk-info';
import { WandSparklesIcon } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/utils/cn';

type ProjectType = 'website' | 'app' | 'backend';

interface Props {
  projectTypes: ProjectType[];
  value: Framework | null;
  onChange: (framework: Framework | null) => void;
  /** Offer a "detect it for me" option, selected when `value` is null. */
  allowNone?: boolean;
  onToggleAll?: (showAll: boolean) => void;
}

const GENERIC_FRAMEWORK_KEY = 'rest';

/**
 * Frameworks matching the project's platforms come first; the rest hide
 * behind "Show all". The HTTP API fits every platform, so it goes last among
 * the suggestions and never becomes the default.
 */
export function frameworksFor(projectTypes: ProjectType[]) {
  const matching =
    projectTypes.length === 0
      ? frameworks
      : frameworks.filter((framework) =>
          framework.type.some((type) => projectTypes.includes(type))
        );
  const suggested = [
    ...matching.filter((framework) => framework.key !== GENERIC_FRAMEWORK_KEY),
    ...matching.filter((framework) => framework.key === GENERIC_FRAMEWORK_KEY),
  ];
  const others = frameworks.filter(
    (framework) => !suggested.includes(framework)
  );
  return { suggested, others };
}

export function FrameworkPicker({
  projectTypes,
  value,
  onChange,
  allowNone,
  onToggleAll,
}: Props) {
  const { suggested, others } = frameworksFor(projectTypes);
  const [showAll, setShowAll] = useState(
    () => value !== null && others.includes(value)
  );
  const visible = showAll ? [...suggested, ...others] : suggested;

  return (
    <div className="col gap-3">
      <div
        aria-label="Framework"
        className="grid grid-cols-2 gap-2 sm:grid-cols-3"
        role="radiogroup"
      >
        {allowNone && (
          <FrameworkOption
            Icon={WandSparklesIcon}
            label="Detect it for me"
            onSelect={() => onChange(null)}
            selected={value === null}
          />
        )}
        {visible.map((framework) => (
          <FrameworkOption
            Icon={framework.IconComponent}
            key={framework.key}
            label={framework.name}
            onSelect={() => onChange(framework)}
            selected={value?.key === framework.key}
          />
        ))}
      </div>
      {others.length > 0 && (
        <button
          className="self-start text-muted-foreground text-sm hover:text-foreground hover:underline"
          onClick={() => {
            onToggleAll?.(!showAll);
            setShowAll((current) => !current);
          }}
          type="button"
        >
          {showAll
            ? 'Show fewer frameworks'
            : `Show all ${suggested.length + others.length} frameworks`}
        </button>
      )}
    </div>
  );
}

function FrameworkOption({
  Icon,
  label,
  selected,
  onSelect,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      aria-checked={selected}
      className={cn(
        'row items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected
          ? 'bg-foreground text-background'
          : 'bg-def-200 text-foreground hover:bg-def-300 dark:bg-def-300 dark:hover:bg-def-400/60'
      )}
      onClick={onSelect}
      role="radio"
      type="button"
    >
      <Icon className="size-5 shrink-0" />
      <span className="truncate font-medium">{label}</span>
    </button>
  );
}
