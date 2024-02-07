import { auth, clerkClient } from '@clerk/nextjs';
import type { User } from '@clerk/nextjs/dist/types/server';

export function transformUser(user: User) {
  return {
    name: `${user.firstName} ${user.lastName}`,
    email: user.emailAddresses[0]?.emailAddress ?? '',
    id: user.id,
    lastName: user.lastName ?? '',
    firstName: user.firstName ?? '',
  };
}

export async function getCurrentUser() {
  const session = auth();
  if (!session.userId) {
    return null;
  }
  return getUserById(session.userId);
}

export async function getUserById(id: string) {
  return clerkClient.users.getUser(id).then(transformUser);
}
