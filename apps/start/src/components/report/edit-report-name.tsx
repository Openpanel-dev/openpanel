import { PencilIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Input } from '../ui/input';
import { setName } from './reportSlice';
import { useDispatch, useSelector } from '@/redux';

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
          onBlur={() => onSubmit()}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              onSubmit();
            }
          }}
          ref={inputRef}
          type="text"
          value={newName}
        />
      </div>
    );
  }

  return (
    <button
      className="group flex h-8 cursor-pointer select-none items-center gap-2 font-medium text-xl"
      onClick={() => setIsEditing(true)}
      type="button"
    >
      {newName || 'Unnamed Report'}
      <PencilIcon
        className="opacity-0 transition-opacity group-hover:opacity-100"
        size={16}
      />
    </button>
  );
};

export default EditReportName;
