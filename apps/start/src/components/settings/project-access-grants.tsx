import type { IProjectAccessGrant } from '@openpanel/core/modules/organization/organization.constants';
import { ComboboxAdvanced } from '@/components/ui/combobox-advanced';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ProjectAccessGrantsProps {
  value: IProjectAccessGrant[];
  onChange: (value: IProjectAccessGrant[]) => void;
  projects: { id: string; name: string }[];
}

/**
 * Picks the projects a member may reach and, for each, whether they may change
 * anything in it. The level used to be hardcoded server-side, so `read` was
 * assigned to people who were meant to have `write` - and nothing enforced it
 * either way. Both halves are real now, so it has to be chooseable.
 */
export function ProjectAccessGrants({
  value,
  onChange,
  projects,
}: ProjectAccessGrantsProps) {
  const selectedIds = value.map((grant) => grant.projectId);

  const handleSelectionChange = (ids: string[]) => {
    onChange(
      ids.map(
        (projectId) =>
          value.find((grant) => grant.projectId === projectId) ?? {
            projectId,
            // Write is the default: restricting someone is the deliberate act.
            level: 'write' as const,
          }
      )
    );
  };

  const handleLevelChange = (projectId: string, level: 'read' | 'write') => {
    onChange(
      value.map((grant) =>
        grant.projectId === projectId ? { ...grant, level } : grant
      )
    );
  };

  return (
    <div className="col gap-2">
      <ComboboxAdvanced
        items={projects.map((project) => ({
          label: project.name,
          value: project.id,
        }))}
        onChange={(ids) => handleSelectionChange(ids as string[])}
        placeholder="Restrict access to projects"
        value={selectedIds}
      />

      {value.length > 0 && (
        <div className="col divide-y rounded-lg border">
          {value.map((grant) => (
            <div
              className="row items-center justify-between gap-2 p-2"
              key={grant.projectId}
            >
              <span className="truncate text-sm">
                {projects.find((project) => project.id === grant.projectId)
                  ?.name ?? grant.projectId}
              </span>
              <Select
                onValueChange={(level) =>
                  handleLevelChange(grant.projectId, level as 'read' | 'write')
                }
                value={grant.level}
              >
                <SelectTrigger className="w-36 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="write">Can edit</SelectItem>
                  <SelectItem value="read">Read-only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
