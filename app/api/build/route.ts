import { apiError, authorizeLocalRequest, readRequestJson } from '../../../lib/agent-server';
import { cancelFounderBuild, founderBuildInputSchema, founderBuildRetrySchema, retryFounderPublication, loadFounderBuildJob, startFounderBuild } from '../../../lib/founder-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  try {
    authorizeLocalRequest(request, true);
    const body = await readRequestJson(request, 1_000_000);
    if (body && typeof body === 'object' && 'action' in body) {
      const input = founderBuildRetrySchema.parse(body);
      return Response.json({ job: await retryFounderPublication(input.id) }, { status: 202, headers });
    }
    const input = founderBuildInputSchema.parse(body);
    return Response.json({ job: await startFounderBuild(input) }, { status: 202, headers });
  } catch (error) { return apiError(error); }
}

export async function GET(request: Request) {
  try {
    authorizeLocalRequest(request);
    return Response.json({ job: await loadFounderBuildJob(new URL(request.url).searchParams.get('id') || '') }, { headers });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request) {
  try {
    authorizeLocalRequest(request, true);
    return Response.json({ job: await cancelFounderBuild(new URL(request.url).searchParams.get('id') || '') }, { headers });
  } catch (error) { return apiError(error); }
}
