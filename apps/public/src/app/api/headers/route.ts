import { NextResponse } from 'next/server';

const IP_HEADER_ORDER = [
  'cf-connecting-ip',
  'true-client-ip',
  'x-vercel-forwarded-for', // Vercel-specific, most reliable on Vercel
  'x-forwarded-for', // Standard proxy header (first IP in chain)
  'x-real-ip', // Alternative header
  'x-client-ip',
  'fastly-client-ip',
  'do-connecting-ip',
  'x-cluster-client-ip',
];

export const GET = function POST(req: Request) {
  return NextResponse.json({
    headers: Object.fromEntries(req.headers),
    ips: IP_HEADER_ORDER.reduce(
      (acc, header) => {
        const value = req.headers.get(header);
        if (value) {
          acc[header] = value;
        }
        return acc;
      },
      {} as Record<string, string>,
    ),
  });
};
