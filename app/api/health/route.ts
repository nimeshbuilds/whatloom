export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ app: 'whatloom', version: 1 }, { headers: { 'Cache-Control': 'no-store' } });
}
