import { apiError, authorizeLocalRequest, readRequestJson } from '../../../lib/agent-server';
import { cancelFounderBuild, founderBuildInputSchema, getFounderBuildJob, startFounderBuild } from '../../../lib/founder-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  try {
    authorizeLocalRequest(request, true);
    const input = founderBuildInputSchema.parse(await readRequestJson(request, 1_000_000));
    return Response.json({ job: await startFounderBuild(input) }, { status: 202, headers });
  } catch (error) { return apiError(error); }
}

export async function GET(request: Request) {
  try {
    authorizeLocalRequest(request);
    return Response.json({ job: getFounderBuildJob(new URL(request.url).searchParams.get('id') || '') }, { headers });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request) {
  try {
    authorizeLocalRequest(request, true);
    return Response.json({ job: await cancelFounderBuild(new URL(request.url).searchParams.get('id') || '') }, { headers });
  } catch (error) { return apiError(error); }
}
