'use client';

import { PencilIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type Props = {
  name?: string;
};

const EditReportName = ({ name }: Props) => {
  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  const onSubmit = () => {
    if (newName === name) {
      return setIsEditing(false);
    }

    if (newName === '') {
      setNewName(name);
    }

    window.dispatchEvent(
      new CustomEvent('report-name-change', {
        detail: newName === '' ? name : newName,
      }),
    );

    setIsEditing(false);
  };

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
    }
  }, [isEditing]);

  if (isEditing) {
    return (
      <div className="flex">
        <input
          ref={inputRef}
          type="text"
          className="w-full rounded-md border border-input p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
      className="flex cursor-pointer select-none items-center gap-2"
      onClick={() => setIsEditing(true)}
    >
      {newName ?? 'Unnamed Report'}
      <PencilIcon size={16} />
    </button>
  );
};

export default EditReportName;
