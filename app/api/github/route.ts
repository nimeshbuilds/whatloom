import { githubActionSchema, githubConnections } from '../../../lib/github-connection.ts';
import { apiError, authorizeLocalRequest, readRequestJson } from '../../../lib/agent-server.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    authorizeLocalRequest(request);
    return Response.json(await githubConnections.status(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    authorizeLocalRequest(request, true);
    const input = githubActionSchema.parse(await readRequestJson(request, 2000));
    const result = input.action === 'login' ? await githubConnections.login() : input.action === 'cancel'
      ? await githubConnections.cancel(input.attemptId) : await githubConnections.selectAccount(input.account);
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return apiError(error); }
}
