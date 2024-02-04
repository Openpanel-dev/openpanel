import { hashPassword } from './crypto';

interface GenerateProfileIdOptions {
  salt: string;
  ua: string;
  ip: string;
  origin: string;
}

export async function generateProfileId({
  salt,
  ua,
  ip,
  origin,
}: GenerateProfileIdOptions) {
  return await hashPassword(`${ua}:${ip}:${origin}`, salt, 8);
}
