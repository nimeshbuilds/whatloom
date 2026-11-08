import { agentConnections, providerSchema } from '../../../../lib/agent-connection.ts';
import { apiError, authorizeLocalRequest } from '../../../../lib/agent-server.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    authorizeLocalRequest(request);
    const provider = providerSchema.parse(new URL(request.url).searchParams.get('provider'));
    return Response.json(await agentConnections.models(provider), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return apiError(error); }
}
