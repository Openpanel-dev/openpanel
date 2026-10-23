import { type Framework, frameworks } from '@openpanel/sdk-info';
import { WandSparklesIcon } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/utils/cn';

type ProjectType = 'website' | 'app' | 'backend';

interface Props {
  projectTypes: ProjectType[];
  value: Framework | null;
  onChange: (framework: Framework | null) => void;
  /** Offer a "detect it for me" option, selected when `value` is null. */
  allowNone?: boolean;
  /** Id of the visible label, so the trigger has an accessible name. */
  labelId?: string;
  className?: string;
}

const GENERIC_FRAMEWORK_KEY = 'rest';
const DETECT_OPTION = 'auto';
const PLATFORM_LABELS: Record<ProjectType, string> = {
  website: 'websites',
  app: 'apps',
  backend: 'backends',
};

/**
 * Frameworks matching the project's platforms come first; the rest sit in
 * a second group. The HTTP API fits every platform, so it goes last among
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

function suggestedLabel(projectTypes: ProjectType[]) {
  if (projectTypes.length === 0) {
    return 'Frameworks';
  }
  return `For ${projectTypes.map((type) => PLATFORM_LABELS[type]).join(' and ')}`;
}

export function FrameworkPicker({
  projectTypes,
  value,
  onChange,
  allowNone,
  labelId,
  className,
}: Props) {
  const { suggested, others } = frameworksFor(projectTypes);
  const selected = value?.key ?? (allowNone ? DETECT_OPTION : undefined);

  const select = (key: string) => {
    if (key === DETECT_OPTION) {
      onChange(null);
      return;
    }
    const framework = frameworks.find((candidate) => candidate.key === key);
    if (framework) {
      onChange(framework);
    }
  };

  return (
    <Select onValueChange={select} value={selected}>
      <SelectTrigger
        aria-labelledby={labelId}
        className={cn('w-full sm:w-64', className)}
      >
        <SelectValue placeholder="Pick a framework" />
      </SelectTrigger>
      <SelectContent>
        {allowNone && (
          <SelectItem value={DETECT_OPTION}>
            <WandSparklesIcon className="size-4 shrink-0" />
            Detect it for me
          </SelectItem>
        )}
        <SelectGroup>
          <SelectLabel>{suggestedLabel(projectTypes)}</SelectLabel>
          {suggested.map((framework) => (
            <FrameworkItem framework={framework} key={framework.key} />
          ))}
        </SelectGroup>
        {others.length > 0 && (
          <SelectGroup>
            <SelectLabel>Other frameworks</SelectLabel>
            {others.map((framework) => (
              <FrameworkItem framework={framework} key={framework.key} />
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}

function FrameworkItem({ framework }: { framework: Framework }) {
  return (
    <SelectItem value={framework.key}>
      <framework.IconComponent className="size-4 shrink-0" />
      {framework.name}
    </SelectItem>
  );
}
