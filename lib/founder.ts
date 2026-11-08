import { z } from 'zod';

const stageValues = ['discover', 'research', 'product', 'brand', 'review', 'build'] as const;
export type FounderStage = typeof stageValues[number];

export const FOUNDER_STORAGE_KEY = 'whatloom.founder.v1';
export const FOUNDER_STAGES: { id: FounderStage; title: string; description: string }[] = [
  { id: 'discover', title: 'Find the opportunity', description: 'Explore different ideas, then choose a problem and a person worth building for.' },
  { id: 'research', title: 'Understand the landscape', description: 'Examine alternatives and sources. Keep what is still unknown visible.' },
  { id: 'product', title: 'Shape the product', description: 'Describe what people need to accomplish and what a useful first product includes.' },
  { id: 'brand', title: 'Give it an identity', description: 'Choose a name, a clear promise, and a visual direction.' },
  { id: 'review', title: 'Review the whole idea', description: 'Edit the documents and explicitly approve the direction before building.' },
  { id: 'build', title: 'Make the first version', description: 'Hand the approved product and brand to a builder, with the open questions attached.' },
];

export interface FounderIdea { id: string; title: string; description: string }
export interface FounderMessage { id: string; stage: FounderStage; role: 'user' | 'assistant'; content: string; createdAt: string }
export interface FounderSource { id: string; title: string; url: string; note: string; checkedAt: string; verified: boolean }
export interface FounderCompetitor { id: string; name: string; url: string; description: string; difference: string; sourceIds: string[] }
export interface FounderName { id: string; name: string; rationale: string }
export interface FounderOpportunity { problem: string; audience: string; whyNow: string; alternatives: string; differentiator: string; assumptions: string[] }
export interface FounderResearch { summary: string; competitors: FounderCompetitor[]; sources: FounderSource[]; unknowns: string[]; researchedAt: string | null }
export interface FounderProduct { what: string; who: string; why: string; journeys: string[]; capabilities: string[]; success: string[]; outOfScope: string[] }
export interface FounderBrand {
  names: FounderName[];
  selectedName: string;
  tagline: string;
  personality: string[];
  palette: { background: string; text: string; primary: string; secondary: string; accent: string };
  typography: { heading: string; body: string };
  logoConcept: string;
}
export interface FounderProject {
  version: 1;
  id: string;
  title: string;
  context: string;
  createdAt: string;
  updatedAt: string;
  stage: FounderStage;
  revision: number;
  messages: FounderMessage[];
  ideas: FounderIdea[];
  selectedIdeaId: string | null;
  opportunity: FounderOpportunity;
  research: FounderResearch;
  product: FounderProduct;
  brand: FounderBrand;
  approval: { approvedAt: string; revision: number } | null;
}
export type FounderPatch = Partial<Pick<FounderProject, 'title' | 'context' | 'stage' | 'ideas' | 'selectedIdeaId' | 'opportunity' | 'research' | 'product' | 'brand'>>;
export interface FounderReadiness { ready: boolean; issues: { stage: FounderStage; message: string }[] }

const text = z.string().max(20_000);
const shortText = z.string().max(500);
const identifier = z.string().min(1).max(120);
const timestamp = z.string().datetime({ offset: true });
const lines = z.array(z.string().max(4000)).max(100);
const webUrl = z.string().max(2400).refine(value => {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}, 'Use a complete HTTP or HTTPS source URL.');
const color = z.string().regex(/^#[a-f\d]{6}$/i, 'Use a six-digit hex color.');
const ideaSchema = z.object({ id: identifier, title: shortText, description: text }).strict();
const messageSchema = z.object({ id: identifier, stage: z.enum(stageValues), role: z.enum(['user', 'assistant']), content: text, createdAt: timestamp }).strict();
const sourceSchema = z.object({ id: identifier, title: shortText, url: webUrl, note: text, checkedAt: timestamp, verified: z.boolean() }).strict();
const competitorSchema = z.object({ id: identifier, name: shortText, url: z.union([z.literal(''), webUrl]), description: text, difference: text, sourceIds: z.array(identifier).max(60) }).strict();
const nameSchema = z.object({ id: identifier, name: z.string().max(100), rationale: text }).strict();
const opportunitySchema = z.object({ problem: text, audience: text, whyNow: text, alternatives: text, differentiator: text, assumptions: lines }).strict();
const researchSchema = z.object({ summary: text, competitors: z.array(competitorSchema).max(40), sources: z.array(sourceSchema).max(100), unknowns: lines, researchedAt: timestamp.nullable() }).strict();
const productSchema = z.object({ what: text, who: text, why: text, journeys: lines, capabilities: lines, success: lines, outOfScope: lines }).strict();
const brandSchema = z.object({
  names: z.array(nameSchema).max(30), selectedName: z.string().max(100), tagline: shortText, personality: z.array(shortText).max(20),
  palette: z.object({ background: color, text: color, primary: color, secondary: color, accent: color }).strict(),
  typography: z.object({ heading: shortText, body: shortText }).strict(), logoConcept: text,
}).strict();
const baseProjectSchema = z.object({
  version: z.literal(1), id: identifier, title: shortText, context: text, createdAt: timestamp, updatedAt: timestamp,
  stage: z.enum(stageValues), revision: z.number().int().nonnegative().safe(), messages: z.array(messageSchema).max(500),
  ideas: z.array(ideaSchema).max(50), selectedIdeaId: identifier.nullable(), opportunity: opportunitySchema,
  research: researchSchema, product: productSchema, brand: brandSchema,
  approval: z.object({ approvedAt: timestamp, revision: z.number().int().nonnegative().safe() }).strict().nullable(),
}).strict();

export const founderPatchSchema = baseProjectSchema.pick({ title: true, context: true, stage: true, ideas: true, selectedIdeaId: true, opportunity: true, research: true, product: true, brand: true }).partial().strict();
export const founderProjectSchema = baseProjectSchema.superRefine((project, ctx) => {
  for (const records of [project.messages, project.ideas, project.research.sources, project.research.competitors, project.brand.names]) {
    if (new Set(records.map(record => record.id)).size !== records.length) ctx.addIssue({ code: 'custom', message: 'Each document collection must have unique record IDs.' });
  }
  if (project.selectedIdeaId && !project.ideas.some(idea => idea.id === project.selectedIdeaId)) ctx.addIssue({ code: 'custom', path: ['selectedIdeaId'], message: 'The selected idea is missing.' });
  const sourceIds = new Set(project.research.sources.map(source => source.id));
  if (project.research.competitors.some(competitor => competitor.sourceIds.some(id => !sourceIds.has(id)))) ctx.addIssue({ code: 'custom', path: ['research', 'competitors'], message: 'A competitor refers to a missing source.' });
  if (project.research.researchedAt && !project.research.sources.some(source => source.verified)) ctx.addIssue({ code: 'custom', path: ['research', 'researchedAt'], message: 'An agent research date requires an agent-verified source.' });
});

const uid = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const now = () => new Date().toISOString();
const hasText = (value: string) => value.trim().length > 0;
const hasLines = (values: string[]) => values.some(hasText);

export function createFounderProject(initialIdea = '', context = ''): FounderProject {
  const createdAt = now();
  return parseFounderProject({
    version: 1, id: uid(), title: initialIdea.trim().slice(0, 100) || 'Untitled product', context,
    createdAt, updatedAt: createdAt, stage: 'discover', revision: 0, messages: [],
    ideas: initialIdea.trim() ? [{ id: uid(), title: initialIdea.trim().slice(0, 100), description: initialIdea.trim() }] : [], selectedIdeaId: null,
    opportunity: { problem: '', audience: '', whyNow: '', alternatives: '', differentiator: '', assumptions: [] },
    research: { summary: '', competitors: [], sources: [], unknowns: [], researchedAt: null },
    product: { what: '', who: '', why: '', journeys: [], capabilities: [], success: [], outOfScope: [] },
    brand: { names: [], selectedName: '', tagline: '', personality: [], palette: { background: '#F7F6F2', text: '#20251D', primary: '#526A3A', secondary: '#DCD5E7', accent: '#D7EE8A' }, typography: { heading: 'Georgia', body: 'Arial' }, logoConcept: '' },
    approval: null,
  });
}

export function parseFounderProject(value: unknown): FounderProject {
  const project = founderProjectSchema.parse(value);
  // Recover the work while discarding a stale approval from an older revision.
  if (project.approval && project.approval.revision !== project.revision) project.approval = null;
  return project;
}

export function updateFounderProject(project: FounderProject, patch: FounderPatch): FounderProject {
  const checkedPatch = founderPatchSchema.parse(patch);
  const nextValue = { ...project, ...checkedPatch };
  // A refreshed shortlist can replace candidate IDs. Preserve the documents for
  // review, but require a new choice if the previously chosen idea disappeared.
  if (checkedPatch.ideas && !('selectedIdeaId' in checkedPatch) && !checkedPatch.ideas.some(idea => idea.id === nextValue.selectedIdeaId)) nextValue.selectedIdeaId = null;
  const next = parseFounderProject(nextValue);
  const materialKeys = ['title', 'context', 'ideas', 'selectedIdeaId', 'opportunity', 'research', 'product', 'brand'] as const;
  const materialChange = materialKeys.some(key => JSON.stringify(project[key]) !== JSON.stringify(next[key]));
  if (materialChange) { next.revision = project.revision + 1; next.approval = null; }
  if (materialChange || next.stage !== project.stage) next.updatedAt = now();
  return next;
}

export function appendFounderMessage(project: FounderProject, message: Pick<FounderMessage, 'stage' | 'role' | 'content'>): FounderProject {
  return parseFounderProject({ ...project, updatedAt: now(), messages: [...project.messages, { ...message, id: uid(), createdAt: now() }] });
}

export function selectFounderIdea(project: FounderProject, id: string): FounderProject {
  const idea = project.ideas.find(candidate => candidate.id === id);
  if (!idea) throw new Error('Choose an idea from this project.');
  return updateFounderProject(project, { selectedIdeaId: id, title: idea.title });
}

export function selectFounderName(project: FounderProject, nameOrId: string): FounderProject {
  const candidate = project.brand.names.find(name => name.id === nameOrId || name.name === nameOrId);
  if (!candidate) throw new Error('Choose a name from the shortlist.');
  return updateFounderProject(project, { brand: { ...project.brand, selectedName: candidate.name } });
}

export function getFounderReadiness(project: FounderProject): FounderReadiness {
  const issues: FounderReadiness['issues'] = [];
  const add = (stage: FounderStage, message: string) => issues.push({ stage, message });
  if (!project.selectedIdeaId || !project.ideas.some(idea => idea.id === project.selectedIdeaId)) add('discover', 'Choose the idea you want to develop.');
  for (const [key, label] of [['problem', 'problem'], ['audience', 'audience'], ['whyNow', 'reason this matters now'], ['alternatives', 'current alternatives'], ['differentiator', 'proposed difference']] as const) {
    if (!hasText(project.opportunity[key])) add('discover', `Describe the ${label}.`);
  }
  if (!hasLines(project.opportunity.assumptions)) add('discover', 'Keep at least one assumption to investigate.');
  if (!hasText(project.research.summary)) add('research', 'Summarize what you learned about the landscape.');
  if (!project.research.sources.length) add('research', 'Record at least one primary source you reviewed, with its URL and date.');
  if (!hasLines(project.research.unknowns)) add('research', 'Record what the research still does not establish.');
  if (project.research.competitors.some(competitor => !competitor.sourceIds.length)) add('research', 'Attach a source to each recorded competitor or substitute.');
  for (const key of ['what', 'who', 'why'] as const) if (!hasText(project.product[key])) add('product', `Write the product’s ${key}.`);
  for (const [key, label] of [['journeys', 'user journey'], ['capabilities', 'capability'], ['success', 'observable success criterion'], ['outOfScope', 'out-of-scope boundary']] as const) {
    if (!hasLines(project.product[key])) add('product', `Include at least one ${label}.`);
  }
  const name = project.brand.names.find(candidate => candidate.name === project.brand.selectedName && hasText(candidate.name));
  if (!name) add('brand', 'Choose a name from your shortlist.');
  if (new Set(project.brand.names.map(candidate => candidate.name.trim().toLowerCase()).filter(Boolean)).size < 2) add('brand', 'Compare at least two distinct name candidates before choosing.');
  if (!hasText(project.brand.tagline)) add('brand', 'Write a clear tagline.');
  if (!hasLines(project.brand.personality)) add('brand', 'Describe the brand’s personality.');
  if (!hasText(project.brand.logoConcept)) add('brand', 'Describe the visual concept.');
  if (!hasText(project.brand.typography.heading) || !hasText(project.brand.typography.body)) add('brand', 'Choose heading and body typefaces.');
  return { ready: issues.length === 0, issues };
}

export function approveFounderProject(project: FounderProject): FounderProject {
  const checked = parseFounderProject(project);
  const readiness = getFounderReadiness(checked);
  if (!readiness.ready) throw new Error(`Complete the review before approval: ${readiness.issues.map(issue => issue.message).join(' ')}`);
  return { ...checked, stage: 'review', updatedAt: now(), approval: { approvedAt: now(), revision: checked.revision } };
}

export function isFounderApproved(project: FounderProject): boolean {
  return project.approval !== null && project.approval.revision === project.revision && getFounderReadiness(project).ready;
}

const bulletList = (values: string[]) => values.filter(hasText).map(value => `- ${value}`).join('\n') || '- Not yet recorded.';
const projectName = (project: FounderProject) => project.brand.selectedName.trim() || project.title;

export function productBriefMarkdown(project: FounderProject): string {
  const brief = project.product;
  return `# ${projectName(project)} — product brief\n\n## What\n${brief.what || 'Not yet recorded.'}\n\n## Who\n${brief.who || 'Not yet recorded.'}\n\n## Why\n${brief.why || 'Not yet recorded.'}\n\n## User journeys\n${bulletList(brief.journeys)}\n\n## Capabilities\n${bulletList(brief.capabilities)}\n\n## Success\n${bulletList(brief.success)}\n\n## Out of scope\n${bulletList(brief.outOfScope)}\n`;
}

const xml = (value: string) => value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!);

export function brandLogoSvg(project: FounderProject, variant: 'lockup' | 'mark' | 'wordmark' = 'lockup'): string {
  const brand = brandSchema.parse(project.brand);
  const name = projectName(project);
  const initials = name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0] || '').join('').toUpperCase();
  const mark = `<rect x="16" y="16" width="208" height="208" rx="66" fill="${brand.palette.primary}"/><path d="M56 57C108 23 192 59 190 116" fill="none" stroke="${brand.palette.accent}" stroke-width="9" stroke-linecap="round"/><text x="120" y="153" text-anchor="middle" font-family="${xml(brand.typography.heading)}" font-size="76" font-weight="600" fill="${brand.palette.background}">${xml(initials)}</text>`;
  const fontSize = Math.max(25, Math.min(80, Math.floor(850 / Math.max(Array.from(name).length * 0.56, 1))));
  const width = variant === 'mark' ? 240 : 1200;
  const nameX = variant === 'wordmark' ? 40 : 280;
  const wordmark = `<text x="${nameX}" y="123" font-family="${xml(brand.typography.heading)}" font-size="${fontSize}" font-weight="600" fill="${brand.palette.text}">${xml(name)}</text><text x="${nameX}" y="177" font-family="${xml(brand.typography.body)}" font-size="22" fill="${brand.palette.text}">${xml(brand.tagline.slice(0, 85))}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="240" viewBox="0 0 ${width} 240" role="img" aria-labelledby="brand-title"><title id="brand-title">${xml(name)} — ${variant}</title><desc>${xml(brand.logoConcept)}</desc>${variant !== 'wordmark' ? mark : ''}${variant !== 'mark' ? wordmark : ''}</svg>`;
}

export function brandTokensCss(project: FounderProject): string {
  const brand = brandSchema.parse(project.brand);
  const quote = (value: string) => JSON.stringify(value).replace(/</g, '\\3c ');
  return `:root {\n${Object.entries(brand.palette).map(([key, value]) => `  --brand-${key}: ${value};`).join('\n')}\n  --brand-font-heading: ${quote(brand.typography.heading)};\n  --brand-font-body: ${quote(brand.typography.body)};\n}\n`;
}

export function brandTokensJson(project: FounderProject): string {
  const brand = brandSchema.parse(project.brand);
  return JSON.stringify({ name: projectName(project), tagline: brand.tagline, palette: brand.palette, typography: brand.typography, personality: brand.personality, logoConcept: brand.logoConcept }, null, 2) + '\n';
}

export function buildHandoffMarkdown(project: FounderProject): string {
  const checked = parseFounderProject(project);
  if (!isFounderApproved(checked)) throw new Error('Review and approve the current product and brand before creating a build handoff.');
  const idea = checked.ideas.find(candidate => candidate.id === checked.selectedIdeaId)!;
  const research = checked.research;
  const brand = checked.brand;
  return `# ${projectName(checked)} — approved build handoff\n\nProject: ${checked.id}\nRevision: ${checked.revision}\nApproved: ${checked.approval!.approvedAt}\n\n## Chosen direction\n${idea.title}\n\n${idea.description}\n\n## Creator context\n${checked.context || 'No additional context recorded.'}\n\n## Opportunity\nProblem: ${checked.opportunity.problem}\n\nAudience: ${checked.opportunity.audience}\n\nWhy now: ${checked.opportunity.whyNow}\n\nCurrent alternatives: ${checked.opportunity.alternatives}\n\nProposed difference: ${checked.opportunity.differentiator}\n\n### Assumptions\n${bulletList(checked.opportunity.assumptions)}\n\n${productBriefMarkdown(checked)}\n## Research\n${research.summary}\n\n${research.competitors.map(competitor => `### ${competitor.name}\n${competitor.url}\n${competitor.description}\n\nProposed difference: ${competitor.difference}\nSources: ${competitor.sourceIds.map(id => research.sources.find(source => source.id === id)?.url || id).join(', ')}`).join('\n\n')}\n\n### Source record\n${research.sources.map(source => `- ${source.title}\n  ${source.url}\n  Recorded checked: ${source.checkedAt}\n  ${source.verified ? 'Agent page retrieval recorded; interpretation still needs review.' : 'Manually recorded source; not verified by an agent page retrieval.'}\n  ${source.note}`).join('\n')}\n\n### Open questions\n${bulletList(research.unknowns)}\n\n## Brand direction\nName: ${brand.selectedName}\nTagline: ${brand.tagline}\nPersonality: ${brand.personality.join(', ')}\nVisual concept: ${brand.logoConcept}\nHeading type: ${brand.typography.heading}\nBody type: ${brand.typography.body}\nPalette: ${Object.entries(brand.palette).map(([key, value]) => `${key} ${value}`).join(', ')}\n\nName candidates and their rationale:\n${brand.names.map(name => `- ${name.name}: ${name.rationale}`).join('\n')}\n\n## Builder responsibilities\nImplement the approved user journeys, capabilities, success criteria, and scope boundaries. Technical architecture, framework, storage, and other implementation choices are delegated to the builder. Explain material tradeoffs and verify the resulting experience. Test the actual user journeys, relevant edge/error states, and persistence/reload behavior; run appropriate build and automated checks, fix failures, and rerun them. Write TESTING.md with reproducible commands, actual outcomes, coverage, and honest limitations. Do not claim market validation or checks that were not performed. The local builder must also write .whatloom/verification.json as specified by Whatloom so the app can independently rerun the checks. Approval of this direction alone does not authorize deployment, publication, purchases, or messages to other people. If the creator separately enables GitHub publishing in the build handoff, Whatloom commits and pushes the generated source to that chosen new repository only after verification passes; the coding agent must not publish itself. Return any product or brand change for review before treating it as approved.\n\nThese documents describe a proposed product. Research does not establish demand, proven novelty, or commercial success. Name availability has not been checked by this workspace.\n`;
}
