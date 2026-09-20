import type { Person } from '../model';
import type { Rng } from '../rng';

const FIRST_NAMES = [
  'Anna',
  'Erik',
  'Maja',
  'Oskar',
  'Elsa',
  'Liam',
  'Olivia',
  'Noah',
  'Emma',
  'Lucas',
  'Sofia',
  'Hugo',
  'Alice',
  'William',
  'Ella',
  'Leo',
  'Mia',
  'Elias',
  'Julia',
  'Axel',
  'Nora',
  'Felix',
  'Ida',
  'Vincent',
  'Clara',
  'Adam',
  'Freja',
  'Isak',
  'Astrid',
  'Theo',
  'James',
  'Charlotte',
  'Benjamin',
  'Amelia',
  'Henry',
  'Harper',
  'Jack',
  'Evelyn',
  'Owen',
  'Luna',
  'Mateo',
  'Camila',
  'Yuki',
  'Haruto',
  'Aarav',
  'Priya',
  'Chen',
  'Mei',
  'Lena',
  'Jonas',
];

const LAST_NAMES = [
  'Andersson',
  'Johansson',
  'Karlsson',
  'Nilsson',
  'Eriksson',
  'Larsson',
  'Olsson',
  'Persson',
  'Smith',
  'Johnson',
  'Williams',
  'Brown',
  'Jones',
  'Garcia',
  'Miller',
  'Davis',
  'Martinez',
  'Müller',
  'Schmidt',
  'Schneider',
  'Fischer',
  'Weber',
  'Meyer',
  'Dubois',
  'Martin',
  'Bernard',
  'Rossi',
  'Russo',
  'Ferrari',
  'Silva',
  'Santos',
  'Tanaka',
  'Suzuki',
  'Sharma',
  'Patel',
  'Wang',
];

const EMAIL_DOMAINS: readonly string[] = [
  'gmail.com',
  'outlook.com',
  'icloud.com',
  'proton.me',
  'hey.com',
  'yahoo.com',
];
const COMPANY_DOMAINS: readonly string[] = [
  'acme.io',
  'northwind.co',
  'globex.com',
  'initech.dev',
  'umbrella.app',
  'hooli.xyz',
];

const AVATAR_BASE = 'https://api.dicebear.com/9.x/notionists/svg?seed=';

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function newPerson(rng: Rng, options: { business: boolean }): Person {
  const firstName = rng.one(FIRST_NAMES);
  const lastName = rng.one(LAST_NAMES);
  const domain = rng.one(options.business ? COMPANY_DOMAINS : EMAIL_DOMAINS);
  const handle = `${slugify(firstName)}.${slugify(lastName)}${rng.int(1, 999)}`;
  return {
    id: `usr_${rng.hex(12)}`,
    firstName,
    lastName,
    email: `${handle}@${domain}`,
    avatar: `${AVATAR_BASE}${handle}`,
    properties: {},
  };
}
