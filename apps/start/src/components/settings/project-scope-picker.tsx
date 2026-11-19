import {
  type IProjectAccessGrant,
  type ProjectScope,
  SELECT_A_PROJECT_MESSAGE,
} from '@openpanel/core/modules/organization/organization.constants';
import { useId } from 'react';
import { ProjectAccessGrants } from '@/components/settings/project-access-grants';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

interface ProjectScopePickerProps {
  projectScope: ProjectScope;
  access: IProjectAccessGrant[];
  onScopeChange: (projectScope: ProjectScope) => void;
  onAccessChange: (access: IProjectAccessGrant[]) => void;
  projects: { id: string; name: string }[];
  isReadOnly?: boolean;
}

/**
 * "All projects" follows projects created later; "Selected projects" is
 * exactly the list below it, and an empty list means no project at all.
 */
export function ProjectScopePicker({
  projectScope,
  access,
  onScopeChange,
  onAccessChange,
  projects,
  isReadOnly,
}: ProjectScopePickerProps) {
  const allId = useId();
  const selectedId = useId();

  return (
    <div className="col gap-3">
      <RadioGroup
        className="flex gap-4"
        onValueChange={(value) => onScopeChange(value as ProjectScope)}
        value={projectScope}
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem id={allId} value="all" />
          <Label className="mb-0" htmlFor={allId}>
            All projects
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem id={selectedId} value="selected" />
          <Label className="mb-0" htmlFor={selectedId}>
            Selected projects
          </Label>
        </div>
      </RadioGroup>
      {projectScope === 'selected' && (
        <>
          <ProjectAccessGrants
            isReadOnly={isReadOnly}
            onChange={onAccessChange}
            projects={projects}
            value={access}
          />
          {access.length === 0 && (
            <p className="text-muted-foreground text-sm">
              {SELECT_A_PROJECT_MESSAGE}
            </p>
          )}
        </>
      )}
    </div>
  );
}
