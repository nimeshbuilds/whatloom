import { apiError, authorizeLocalRequest, readRequestJson, researchExploration, researchInputSchema } from '../../../lib/agent-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    authorizeLocalRequest(request, true);
    const input = researchInputSchema.parse(await readRequestJson(request));
    const research = await researchExploration(input, request.signal);
    return Response.json({ ...research, provider: input.provider }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiError(error);
  }
}
