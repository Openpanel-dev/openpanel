import { animals, names, uniqueNamesGenerator } from 'unique-names-generator';

export function randomName() {
  return uniqueNamesGenerator({
    dictionaries: [names, animals],
    length: 2,
    style: 'capital',
    separator: ' ',
  });
}

export function randomSplitName() {
  const [firstName, lastName] = randomName().split(' ');
  return {
    firstName,
    lastName,
  };
}
