import { db } from '@openpanel/db';

import { slug } from './slug';

export async function getId(tableName: 'project' | 'dashboard', name: string) {
  const newId = slug(name);
  if (!db[tableName]) {
    throw new Error('Table does not exists');
  }

  if (!('findUnique' in db[tableName])) {
    throw new Error('findUnique does not exists');
  }

  // @ts-expect-error
  const existingProject = await db[tableName].findUnique({
    where: {
      id: newId,
    },
  });

  function random(str: string) {
    const numbers = Math.floor(1000 + Math.random() * 9000);
    if (str.match(/-\d{4}$/g)) {
      return str.replace(/-\d{4}$/g, `-${numbers}`);
    }
    return `${str}-${numbers}`;
  }

  if (existingProject) {
    return getId(tableName, random(name));
  }

  return newId;
}
