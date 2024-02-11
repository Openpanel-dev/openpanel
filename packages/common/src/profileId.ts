import { createHash } from './crypto';

interface GenerateProfileIdOptions {
  salt: string;
  ua: string;
  ip: string;
  origin: string;
}

export function generateProfileId({
  salt,
  ua,
  ip,
  origin,
}: GenerateProfileIdOptions) {
  return createHash(`${ua}:${ip}:${origin}:${salt}`, 16);
}
