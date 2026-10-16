import { createHash } from '@openpanel/shared/server';

interface GenerateDeviceIdOptions {
  salt: string;
  ua: string;
  ip: string;
  origin: string;
}

export function generateDeviceId({
  salt,
  ua,
  ip,
  origin,
}: GenerateDeviceIdOptions) {
  return createHash(`${ua}:${ip}:${origin}:${salt}`, 16);
}
