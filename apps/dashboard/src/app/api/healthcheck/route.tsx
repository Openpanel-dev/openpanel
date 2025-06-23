export const dynamic = 'force-dynamic'; // no caching

export async function GET(request: Request) {
  return Response.json({ status: 'ok' });
}
