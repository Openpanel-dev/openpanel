export const API_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://api.openpanel.dev'
    : (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333');
