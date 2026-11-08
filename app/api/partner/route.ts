import { apiError, authorizeLocalRequest, readRequestJson } from '../../../lib/agent-server';
import { partnerInputSchema, runFounderPartner } from '../../../lib/founder-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    authorizeLocalRequest(request, true);
    const input = partnerInputSchema.parse(await readRequestJson(request, 1_000_000));
    return Response.json(await runFounderPartner(input, request.signal), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return apiError(error); }
}
