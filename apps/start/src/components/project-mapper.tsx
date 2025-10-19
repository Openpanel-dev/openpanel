import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { IServiceProject } from '@openpanel/db';
import { PlusIcon, XIcon } from 'lucide-react';
import type {
  Control,
  FieldArrayWithId,
  UseFieldArrayAppend,
  UseFieldArrayRemove,
  UseFormRegister,
  UseFormSetValue,
  UseFormWatch,
} from 'react-hook-form';

interface ProjectMapperProps {
  fields: FieldArrayWithId<any, 'projectMapper', 'id'>[];
  append: UseFieldArrayAppend<any, 'projectMapper'>;
  remove: UseFieldArrayRemove;
  projects: IServiceProject[];
  register: UseFormRegister<any>;
  watch: UseFormWatch<any>;
  setValue: UseFormSetValue<any>;
}

export function ProjectMapper({
  fields,
  append,
  remove,
  projects,
  register,
  watch,
  setValue,
}: ProjectMapperProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="mb-0">Project Mapper (Optional)</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append({ from: '', to: '' })}
        >
          <PlusIcon className="mr-1 h-4 w-4" />
          Add Mapping
        </Button>
      </div>
      {fields.length === 0 && (
        <p className="text-sm text-muted-foreground leading-normal">
          Map source project IDs to your OpenPanel projects. If you skip mapping
          all data will be imported to your current project.
        </p>
      )}

      {fields.length > 0 && (
        <div className="space-y-2">
          {fields.map((field, index) => (
            <div key={field.id} className="gap-2 rounded-md border p-3 row">
              <div className="grid grid-cols-2 gap-2">
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">
                    From (Source Project ID)
                  </Label>
                  <Input
                    placeholder="e.g., abc123"
                    {...register(`projectMapper.${index}.from`)}
                    className="mt-1"
                  />
                </div>
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">
                    To (OpenPanel Project)
                  </Label>
                  <Select
                    value={watch(`projectMapper.${index}.to`)}
                    onValueChange={(value) =>
                      setValue(`projectMapper.${index}.to`, value)
                    }
                  >
                    <SelectTrigger className="mt-1 w-full" size="sm">
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.slice(0, 10).map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(index)}
                className="mt-5"
              >
                <XIcon className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
