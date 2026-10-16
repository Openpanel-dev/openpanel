import type { IServiceProject } from '@openpanel/core';
import { PlusIcon, XIcon } from 'lucide-react';
import type {
  FieldArrayWithId,
  UseFieldArrayAppend,
  UseFieldArrayRemove,
  UseFormRegister,
  UseFormSetValue,
  UseFormWatch,
} from 'react-hook-form';
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
          onClick={() => append({ from: '', to: '' })}
          size="sm"
          type="button"
          variant="outline"
        >
          <PlusIcon className="mr-1 h-4 w-4" />
          Add Mapping
        </Button>
      </div>
      {fields.length === 0 && (
        <p className="text-muted-foreground text-sm leading-normal">
          Map source project IDs to your OpenPanel projects. If you skip mapping
          all data will be imported to your current project.
        </p>
      )}

      {fields.length > 0 && (
        <div className="space-y-2">
          {fields.map((field, index) => (
            <div className="row gap-2 rounded-md border p-3" key={field.id}>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex-1">
                  <Label className="text-muted-foreground text-xs">
                    From (Source Project ID)
                  </Label>
                  <Input
                    placeholder="e.g., abc123"
                    {...register(`projectMapper.${index}.from`)}
                    className="mt-1"
                  />
                </div>
                <div className="flex-1">
                  <Label className="text-muted-foreground text-xs">
                    To (OpenPanel Project)
                  </Label>
                  <Select
                    onValueChange={(value) =>
                      setValue(`projectMapper.${index}.to`, value)
                    }
                    value={watch(`projectMapper.${index}.to`)}
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
                className="mt-5"
                onClick={() => remove(index)}
                size="icon"
                type="button"
                variant="ghost"
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
