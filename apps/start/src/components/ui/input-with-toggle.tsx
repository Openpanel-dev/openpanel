import type { Dispatch, SetStateAction } from 'react';
import AnimateHeight from '../animate-height';
import { Label } from './label';
import { Switch } from './switch';

type Props = {
  active: boolean;
  onActiveChange: (newValue: boolean) => void;
  label: string;
  children: React.ReactNode;
};

export function InputWithToggle({
  active,
  onActiveChange,
  label,
  children,
}: Props) {
  return (
    <div className="col gap-2">
      <div className="flex gap-2 items-center justify-between">
        <Label className="mb-0">{label}</Label>
        <Switch checked={active} onCheckedChange={onActiveChange} />
      </div>
      <AnimateHeight open={active}>{children}</AnimateHeight>
    </div>
  );
}
