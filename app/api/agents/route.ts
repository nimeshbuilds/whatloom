import { apiError, authorizeLocalRequest, getAgentStatuses } from '../../../lib/agent-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    authorizeLocalRequest(request);
    return Response.json({ agents: await getAgentStatuses() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiError(error);
  }
}
