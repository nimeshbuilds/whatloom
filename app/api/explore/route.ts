import { apiError, authorizeLocalRequest, exploreInputSchema, generateExploration, readRequestJson } from '../../../lib/agent-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    authorizeLocalRequest(request, true);
    const input = exploreInputSchema.parse(await readRequestJson(request));
    const exploration = await generateExploration(input, request.signal);
    return Response.json({ exploration, provider: input.provider }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiError(error);
  }
}
