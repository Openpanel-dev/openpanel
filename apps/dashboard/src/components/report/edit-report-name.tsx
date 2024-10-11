'use client';

import { PencilIcon } from 'lucide-react';
import { useState } from 'react';

type Props = {
  name?: string;
};

const EditReportName = ({ name }: Props) => {
  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState(name);

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

  if (isEditing) {
    return (
      <div className="flex">
        <input
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
      className="flex cursor-pointer select-none items-center gap-2"
      onClick={() => setIsEditing(true)}
    >
      {newName ?? 'Unnamed Report'}
      <PencilIcon size={16} />
    </button>
  );
};

export default EditReportName;
