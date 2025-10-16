const prefix = '@op';

export function getStorageItem<T>(key: string): T | null;
export function getStorageItem<T>(key: string, defaultValue: T): T;
export function getStorageItem<T>(key: string, defaultValue?: T): T | null {
  if (typeof window === 'undefined') return defaultValue ?? null;
  const item = localStorage.getItem(`${prefix}:${key}`);
  if (item === null) {
    return defaultValue ?? null;
  }

  return item as T;
}

export function setStorageItem(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`${prefix}:${key}`, value as string);
}

export function removeStorageItem(key: string) {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(`${prefix}:${key}`);
}
