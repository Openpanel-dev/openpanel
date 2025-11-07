import { useDispatch, useSelector } from '@/redux';
import { PencilIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Input } from '../ui/input';
import { setName } from './reportSlice';

type Props = {
  name?: string;
};

const EditReportName = ({ name }: Props) => {
  const reportName = useSelector((state) => state.report.name);
  const dispatch = useDispatch();
  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState(reportName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setNewName(reportName);
  }, [reportName]);

  const onSubmit = () => {
    if (newName === name) {
      return setIsEditing(false);
    }

    if (!newName) {
      setNewName(reportName);
    }

    setIsEditing(false);
    dispatch(setName(newName));
  };

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
    }
  }, [isEditing]);

  if (isEditing) {
    return (
      <div className="flex h-8">
        <Input
          ref={inputRef}
          type="text"
          value={newName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              onSubmit();
            }
          }}
          onChange={(e) => setNewName(e.target.value)}
          onBlur={() => onSubmit()}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      className="flex cursor-pointer select-none items-center gap-2 text-xl font-medium h-8 group"
      onClick={() => setIsEditing(true)}
    >
      {newName ?? 'Unnamed Report'}
      <PencilIcon
        size={16}
        className="opacity-0 group-hover:opacity-100 transition-opacity"
      />
    </button>
  );
};

export default EditReportName;
