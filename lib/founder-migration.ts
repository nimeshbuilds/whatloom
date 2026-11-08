import { z } from 'zod';
import { createFounderProject, parseFounderProject } from './founder.ts';
import type { FounderIdea, FounderProject, FounderSource } from './founder.ts';
import { parseImport } from './studio.ts';
import type { StudioProject } from './studio-types';

const timestamp = z.string().datetime({ offset: true });
const freshId = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function sourceUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && value.length <= 2400 ? url.href : undefined;
  } catch { return undefined; }
}

function importedIdea(path: StudioProject['paths'][number], assumptions: StudioProject['assumptions']): FounderIdea {
  return {
    id: freshId(), title: path.title || 'Imported path',
    description: [
      `Imported possibility, not a validated product. Legacy path ID: ${path.id}`,
      `Subtitle: ${path.subtitle}`, path.description,
      `Mechanism: ${path.mechanism}`, `Opportunity: ${path.opportunity}`,
      `Unresolved constraint: ${path.obstacle}`, `First move: ${path.firstMove}`,
      `Original horizon: ${path.horizon}; display color: ${path.color}`,
      `Original assumption IDs: ${path.assumptionIds.join(', ')}`,
      `Connected assumptions:\n${assumptions.filter(assumption => assumption.pathIds.includes(path.id)).map(assumption => `- ${assumption.text}`).join('\n')}`,
    ].join('\n\n'),
  };
}

/** Copy an archived exploration into a fresh founder draft; never mutate or approve it. */
export function founderFromExploration(value: StudioProject): FounderProject {
  const legacy = parseImport(value);
  const ideas = legacy.paths.map(path => importedIdea(path, legacy.assumptions));
  const sources: FounderSource[] = [];
  const unmappedEvidenceIds: string[] = [];
  for (const evidence of legacy.evidence) {
    const url = sourceUrl(evidence.url);
    // addedAt is the historical record date, not a new retrieval. An invalid or
    // missing date must not be replaced with "now" and presented as a check.
    if (evidence.kind !== 'source' || !url || !timestamp.safeParse(evidence.addedAt).success) {
      unmappedEvidenceIds.push(evidence.id);
      continue;
    }
    sources.push({
      id: freshId(), title: evidence.title || 'Imported source record', url,
      checkedAt: evidence.addedAt, verified: false,
      note: [
        'Imported legacy source record; not re-opened or verified during conversion.',
        'The checkedAt value preserves its original addedAt record date, not a fresh page review.',
        `Legacy evidence ID: ${evidence.id}; original relationship: ${evidence.stance}.`,
        evidence.assumptionId ? `Original connected assumption ID: ${evidence.assumptionId}.` : 'Originally recorded as general context.',
        evidence.excerpt,
      ].join('\n\n'),
    });
  }

  const context = [
    'COPIED FROM AN EARLIER EXPLORATION',
    'This is a separate draft. The original exploration is unchanged. Select an idea explicitly and review the imported material before developing or approving a product.',
    `Legacy project ID: ${legacy.id}\nOriginal title: ${legacy.title}\nOriginal area: ${legacy.domain}\nOriginal origin: ${legacy.origin}\nOriginal createdAt: ${legacy.createdAt}\nOriginal updatedAt: ${legacy.updatedAt}`,
    `VISION\n${legacy.vision}`,
    `ORIGINAL CONTEXT\n${legacy.context}`,
    `ORIGINAL THESIS (NOT VERIFIED BY THIS CONVERSION)\n${legacy.thesis}`,
    `FIELD NOTES\n${legacy.notes}`,
    `CONSTRAINTS\n${legacy.constraints.map(item => `- ${item}`).join('\n')}`,
    `POSSIBLE ECOSYSTEM\n${legacy.ecosystem.map(item => `- ${item}`).join('\n')}`,
    `LEGACY ASSUMPTION RECORDS\nHistorical statuses are retained here as original records, not newly validated findings.\n${JSON.stringify(legacy.assumptions, null, 2)}`,
    `LEGACY EXPERIMENT RECORDS\nHistorical plans, statuses, and results are retained without a new validation claim.\n${JSON.stringify(legacy.experiments, null, 2)}`,
    `LEGACY EVIDENCE RECORDS\nAll original records are retained below, including observations, hypotheses, and entries that cannot become dated HTTP(S) source records.\n${JSON.stringify(legacy.evidence, null, 2)}`,
    unmappedEvidenceIds.length ? `Evidence IDs kept only in this context because of their type, URL, or date: ${unmappedEvidenceIds.join(', ')}` : 'Imported source links still need a fresh review; no pages were opened during conversion.',
  ].join('\n\n');

  if (context.length > 20_000 || ideas.some(idea => idea.description.length > 20_000 || idea.title.length > 500) || legacy.title.length > 500 || sources.length > 100 || legacy.assumptions.length > 100 || legacy.assumptions.some(assumption => assumption.text.length > 4000)) {
    throw new Error('This exploration is too large to copy into a founder draft without losing details. Keep or export its original backup; nothing was changed.');
  }

  const draft = createFounderProject();
  return parseFounderProject({
    ...draft, title: legacy.title || 'Imported exploration', context, ideas,
    selectedIdeaId: null, approval: null, stage: 'discover',
    opportunity: { ...draft.opportunity, assumptions: legacy.assumptions.map(assumption => assumption.text) },
    research: {
      summary: '', competitors: [], sources, researchedAt: null,
      unknowns: [
        'Choose one imported possibility and define the person and problem it would serve.',
        'Re-open any imported source before relying on it for a current competitive claim.',
        'Review historical assumption statuses and experiment results; the conversion did not validate them.',
      ],
    },
  });
}
