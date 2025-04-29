export const runtime = 'edge';
export const dynamic = 'force-dynamic'; // no caching

export async function GET(request: Request) {
  const headers = Object.fromEntries(request.headers.entries());
  return Response.json({ headers, region: process.env.VERCEL_REGION });
}
