import { agentConnections, authActionSchema, providerSchema } from '../../../../lib/agent-connection.ts';
import { apiError, authorizeLocalRequest, readRequestJson } from '../../../../lib/agent-server.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    authorizeLocalRequest(request);
    const provider = providerSchema.parse(new URL(request.url).searchParams.get('provider'));
    return Response.json(await agentConnections.status(provider), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    authorizeLocalRequest(request, true);
    const input = authActionSchema.parse(await readRequestJson(request, 2000));
    const value = input.action === 'start' ? await agentConnections.start(input.provider) : await agentConnections.cancel(input.provider, input.attemptId!);
    return Response.json(value, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return apiError(error); }
}
