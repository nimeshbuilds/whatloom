import { z } from 'zod';
import type { StudioProject, GeneratedExploration } from './studio-types';
export type * from './studio-types';

export const uid = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const STORAGE_KEY = 'whatloom.studio.v1';
const now = () => new Date().toISOString();

const scenes = [
  {
    id: 'homes', title: 'Homes that care for themselves', domain: 'Living',
    vision: 'What if our homes could take care of themselves, so we could spend more time living?',
    thesis: 'A home could become an active participant in everyday life. Explore three different ways to make care happen before something breaks.',
    ecosystem: ['Trusted home data', 'Repair networks', 'Device interoperability', 'Maintenance assurance', 'Independent verification'],
    paths: [
      { title: 'The quiet caretaker', subtitle: 'Sense a problem before it becomes one.', description: 'Start with a single maintenance problem. Combine lightweight sensing with human judgment to make early care practical.', mechanism: 'A small set of signals triggers a specific, explainable maintenance action. A person confirms anything consequential.', opportunity: 'People could avoid the effort of remembering routine care, while technicians gain clearer context before a visit.', obstacle: 'Useful signals must be distinguishable from noise. False alarms could quickly erase trust.', firstMove: 'Observe one recurring maintenance task in five households. Test whether a simple reminder tied to a real signal beats their current routine.', horizon: 'Now' },
      { title: 'A home care network', subtitle: 'Coordinate the care that already exists.', description: 'Make household upkeep a coordinated service using existing people, devices, and suppliers.', mechanism: 'A shared maintenance record connects residents with vetted local specialists. Begin with manual coordination.', opportunity: 'A household gets continuity of care. Small service businesses could spend less time reconstructing the same history.', obstacle: 'Someone must own service quality, scheduling failures, and the cost of coordination.', firstMove: 'Run a manual home-care service for three households for two weeks. Record every handoff and the actual time it takes.', horizon: 'Next' },
      { title: 'Care as a guarantee', subtitle: 'Change the incentive, change the system.', description: 'Explore a membership where keeping the home working is the provider’s responsibility.', mechanism: 'A bounded service guarantee aligns preventive maintenance with the provider’s economics.', opportunity: 'New services could emerge around predictable care, transparent risk, and trusted verification.', obstacle: 'Pricing depends on failure rates and service costs that must be measured before offering any guarantee.', firstMove: 'Model one narrowly defined appliance-care service from observed costs. Ask service providers to challenge the assumptions.', horizon: 'Later' },
    ],
    assumptions: [
      ['Households value avoided maintenance effort enough to change their routine.', 'A useful capability still needs a meaningful reason for adoption.', [0, 1]],
      ['A small number of signals can identify one maintenance need reliably.', 'Frequent false alarms could make the caretaker less useful than a calendar.', [0]],
      ['Residents will consent to the minimum data needed for the service.', 'Consent and trust shape which approaches remain viable.', [0, 1]],
      ['Local specialists benefit from a shared maintenance history.', 'The service needs a reason for partners to participate.', [1]],
      ['Preventive care can cost less than the failures it avoids.', 'The guarantee depends on real cost evidence, not a plausible story.', [2]],
      ['The first service can be valuable without controlling the entire home.', 'A narrow beginning must produce a useful standalone outcome.', [0, 1, 2]],
    ],
  },
  {
    id: 'making', title: 'Every idea, made physical', domain: 'Making',
    vision: 'What if anyone could describe an object they need and have it made nearby?',
    thesis: 'Explore the distance between imagining an object and holding it. Different paths could remove design effort, production friction, or the need to own a factory.',
    ecosystem: ['Design verification', 'Local fabrication', 'Material libraries', 'Production routing', 'Design licensing'],
    paths: [
      { title: 'A design translator', subtitle: 'From a human need to a usable specification.', description: 'Help people turn a plain-language need into a human-reviewed design for a narrow family of objects.', mechanism: 'Constrain the design space, ask clarifying questions, and check every dimension against fabrication rules.', opportunity: 'People without CAD skills could commission useful custom objects.', obstacle: 'An attractive rendering does not establish manufacturability or fitness for use.', firstMove: 'Make five custom desk organizers from real customer descriptions. Track corrections, material waste, and delivery time.', horizon: 'Now' },
      { title: 'The neighborhood factory', subtitle: 'Give existing machines a shared front door.', description: 'Coordinate local fabrication capacity through a carefully managed production service.', mechanism: 'Match verified specifications with suitable machines and human operators.', opportunity: 'Small workshops could serve customers who cannot navigate manufacturing suppliers today.', obstacle: 'Quality and delivery need to remain consistent across different operators.', firstMove: 'Manually route five low-risk orders through two workshops. Record the real coordination cost.', horizon: 'Next' },
      { title: 'Objects as living designs', subtitle: 'Let useful designs evolve and circulate.', description: 'Build a library of adaptable designs with a clear path from creator to local production.', mechanism: 'Verified design families become reusable starting points, with attribution and licensing built into the workflow.', opportunity: 'Creators could earn from adaptable designs while customers receive objects matched to their needs.', obstacle: 'Rights, versioning, and verification need clear ownership.', firstMove: 'Invite three designers to adapt one design family for five customers. Observe reuse, attribution needs, and willingness to pay.', horizon: 'Later' },
    ],
    assumptions: [
      ['Customers have needs that standard products do not satisfy.', 'Personalization needs to solve a concrete problem.', [0, 1, 2]],
      ['A constrained specification can be generated and verified reliably.', 'The first design family needs a checkable definition of correct.', [0]],
      ['Local fabrication can meet an acceptable price and delivery time.', 'Proximity alone does not establish better economics.', [1]],
      ['Workshops have suitable capacity and want these orders.', 'A network needs willing and reliable supply.', [1]],
      ['Designers will license useful, adaptable design families.', 'The library needs a workable incentive for original creators.', [2]],
      ['Customers will pay for a complete outcome rather than a design file.', 'The strongest entry point depends on what people actually buy.', [0, 1, 2]],
    ],
  },
  {
    id: 'learning', title: 'Learning that follows your curiosity', domain: 'Learning',
    vision: 'What if learning followed your curiosity instead of a fixed curriculum?',
    thesis: 'Explore how a person’s questions could become a path to real competence, with useful projects and trustworthy feedback along the way.',
    ecosystem: ['Project mentors', 'Skill verification', 'Community learning', 'Learning materials', 'Practical assessment'],
    paths: [
      { title: 'A personal field guide', subtitle: 'Turn a question into a small expedition.', description: 'Use a learner’s actual question to build a sequence of experiments and explanations.', mechanism: 'A short project exposes specific knowledge gaps, and the guide introduces concepts when they become useful.', opportunity: 'Learners could connect abstract concepts with something they care about making.', obstacle: 'Engagement does not automatically establish understanding.', firstMove: 'Guide five learners through one curiosity-led project. Check transfer using a new problem afterward.', horizon: 'Now' },
      { title: 'A studio of peers', subtitle: 'Build understanding by making together.', description: 'Create small groups around a shared question and complementary skills.', mechanism: 'A facilitator coordinates projects, peer explanation, and periodic expert feedback.', opportunity: 'The learning experience could include motivation, community, and accountability.', obstacle: 'Participation and facilitation require sustained effort.', firstMove: 'Run one two-week project with a small group. Compare participation and independently assessed understanding.', horizon: 'Next' },
      { title: 'Proof of understanding', subtitle: 'Make competence visible outside a course.', description: 'Explore credible ways to recognize skills learned through independent projects.', mechanism: 'A portfolio is paired with a practical demonstration and independent review.', opportunity: 'Learning paths could become more flexible when demonstrated competence is trusted.', obstacle: 'Reviewers need evidence they can evaluate consistently.', firstMove: 'Have two independent reviewers assess the same five project demonstrations. Examine disagreements.', horizon: 'Later' },
    ],
    assumptions: [
      ['Learners can identify a question that sustains their effort.', 'Curiosity needs to lead to continued participation.', [0, 1]],
      ['A short project can reveal and address meaningful knowledge gaps.', 'The guide needs evidence of learning beyond completion.', [0]],
      ['Feedback can be accurate, timely, and understandable.', 'Incorrect guidance can undermine the whole learning path.', [0, 1, 2]],
      ['A small peer group improves the experience enough to justify coordination.', 'The community needs to add value to the learning itself.', [1]],
      ['Independent reviewers can agree on evidence of competence.', 'A credential becomes useful only when others trust its meaning.', [2]],
      ['The first experience can deliver value in two weeks.', 'A short entry point makes participation and evaluation practical.', [0, 1, 2]],
    ],
  },
] as const;

export function exampleProject(sceneId: string): StudioProject {
  const scene = scenes.find(s => s.id === sceneId) || scenes[0];
  const id = `example-${scene.id}`;
  const colors = ['lime', 'lavender', 'peach'] as const;
  const paths = scene.paths.map((p, i) => ({ ...p, id: `${id}-p${i}`, color: colors[i], assumptionIds: scene.assumptions.flatMap((a, j) => (a[2] as readonly number[]).includes(i) ? [`${id}-a${j}`] : []) }));
  return {
    id, title: scene.title, vision: scene.vision, thesis: scene.thesis, domain: scene.domain, context: '', createdAt: now(), updatedAt: now(),
    paths, assumptions: scene.assumptions.map((a, i) => ({ id: `${id}-a${i}`, text: a[0], whyItMatters: a[1], status: 'untested', pathIds: a[2].map(n => `${id}-p${n}`) })),
    experiments: paths.map((p, i) => ({ id: `${id}-e${i}`, title: ['Make the possibility tangible', 'Test the coordination', 'Challenge the economics'][i], method: p.firstMove, successSignal: 'Define a concrete pass or fail threshold with your participants before starting.', status: 'planned', result: '', pathId: p.id })),
    evidence: [], ecosystem: [...scene.ecosystem], notes: '', constraints: [], origin: 'example',
  };
}
export const EXAMPLES = scenes.map(({ id, title, domain, vision }) => ({ id, title, domain, vision }));

export function guidedProject(vision: string, context: string, domain: string): StudioProject {
  const id = uid();
  const cleanTitle = vision.replace(/^what if\s+/i, '').replace(/[?.!]+$/, '');
  const title = cleanTitle.length > 68 ? cleanTitle.slice(0, 68).replace(/\s+\S*$/, '') + '…' : cleanTitle;
  const paths = [
    { id: `${id}-p0`, title: 'Make the capability possible', subtitle: 'Explore a technical mechanism.', description: `Identify the smallest new capability required for this future: “${vision}”`, mechanism: 'Describe a mechanism that could remove one concrete technical constraint. Name what still needs to be demonstrated.', opportunity: 'Who could do something valuable that they cannot do today?', obstacle: 'What technical assumption could make this approach fail?', firstMove: 'Build a small demonstration of one capability, then test it under a realistic condition.', horizon: 'Now' as const, color: 'lime' as const, assumptionIds: [`${id}-a0`, `${id}-a3`] },
    { id: `${id}-p1`, title: 'Connect what already exists', subtitle: 'Explore a coordination mechanism.', description: 'Investigate whether the ingredients already exist, but people, information, or incentives do not connect.', mechanism: 'List existing capabilities and describe a new way to coordinate them. Begin by delivering the outcome manually.', opportunity: 'Who benefits when a difficult handoff disappears?', obstacle: 'Whose participation is essential, and why would they join?', firstMove: 'Deliver one real outcome manually. Measure every handoff, its cost, and where trust is needed.', horizon: 'Next' as const, color: 'lavender' as const, assumptionIds: [`${id}-a1`, `${id}-a3`] },
    { id: `${id}-p2`, title: 'Change the underlying incentive', subtitle: 'Explore a different system.', description: 'Investigate a new ownership, access, payment, or assurance model that could make the future viable.', mechanism: 'Describe who pays, who benefits, who owns the risk, and what behavior changes as a result.', opportunity: 'What becomes accessible when the economics or incentives change?', obstacle: 'Which unproven cost or behavioral assumption does the model depend on?', firstMove: 'Write a narrowly bounded offer. Test it with potential participants and model the costs using observed inputs.', horizon: 'Later' as const, color: 'peach' as const, assumptionIds: [`${id}-a2`, `${id}-a3`] },
  ];
  return { id, title: title.charAt(0).toUpperCase() + title.slice(1), vision, thesis: 'A guided starting structure. Replace these questions with your own reasoning, or connect a local AI to develop paths specific to your vision.', domain: domain || 'Open exploration', context, createdAt: now(), updatedAt: now(), paths,
    assumptions: [
      { id: `${id}-a0`, text: 'The essential capability can be demonstrated in a narrow setting.', whyItMatters: 'Name the capability and define observable success.', status: 'untested', pathIds: [paths[0].id] },
      { id: `${id}-a1`, text: 'The necessary participants will coordinate to deliver the outcome.', whyItMatters: 'Identify a reason for every participant to take part.', status: 'untested', pathIds: [paths[1].id] },
      { id: `${id}-a2`, text: 'A different incentive or business model can sustain the outcome.', whyItMatters: 'Use actual costs and behavior to challenge the model.', status: 'untested', pathIds: [paths[2].id] },
      { id: `${id}-a3`, text: 'A specific group of people cares enough to try a different approach.', whyItMatters: 'Identify real people and the problem they experience.', status: 'untested', pathIds: paths.map(p => p.id) },
    ], evidence: [], experiments: paths.map((p,i) => ({ id: `${id}-e${i}`, title: `First proof: ${p.title.toLowerCase()}`, method: p.firstMove, successSignal: 'Set an observable pass or fail threshold before beginning.', result: '', status: 'planned', pathId: p.id })), ecosystem: ['People to learn from', 'Capabilities to investigate', 'Partners to involve', 'Infrastructure to create'], notes: '', constraints: [], origin: 'guided' };
}

export function fromGenerated(data: GeneratedExploration, vision: string, context: string, domain: string, provider: 'codex' | 'claude'): StudioProject {
  return { ...data, id: uid(), vision, context, domain, createdAt: now(), updatedAt: now(), origin: provider, evidence: [], notes: '', constraints: [] };
}

const pathSchema = z.object({id:z.string(),title:z.string(),subtitle:z.string(),description:z.string(),mechanism:z.string(),opportunity:z.string(),obstacle:z.string(),firstMove:z.string(),horizon:z.enum(['Now','Next','Later']),color:z.enum(['lime','lavender','peach']),assumptionIds:z.array(z.string())});
const projectSchema = z.object({id:z.string(),title:z.string(),vision:z.string(),thesis:z.string(),domain:z.string(),context:z.string(),createdAt:z.string(),updatedAt:z.string(),paths:z.array(pathSchema).min(1).max(20),assumptions:z.array(z.object({id:z.string(),text:z.string(),whyItMatters:z.string(),status:z.enum(['untested','supported','challenged']),pathIds:z.array(z.string())})).max(200),evidence:z.array(z.object({id:z.string(),title:z.string(),url:z.string(),excerpt:z.string(),kind:z.enum(['source','observation','hypothesis']),stance:z.enum(['supports','challenges','context']),assumptionId:z.string().optional(),addedAt:z.string()})).max(500),experiments:z.array(z.object({id:z.string(),title:z.string(),method:z.string(),successSignal:z.string(),result:z.string(),status:z.enum(['planned','running','complete']),pathId:z.string()})).max(100),ecosystem:z.array(z.string()),notes:z.string(),origin:z.enum(['example','guided','codex','claude']),constraints:z.array(z.string())});
export function parseImport(value: unknown): StudioProject {
  const project = projectSchema.parse(value);
  const ids = new Set<string>();
  for (const item of [...project.paths, ...project.assumptions, ...project.experiments, ...project.evidence]) {
    if (!item.id.trim() || ids.has(item.id)) throw new Error('Exploration records must have unique, nonempty IDs.');
    ids.add(item.id);
  }
  const paths = new Map(project.paths.map(path => [path.id, path]));
  const assumptions = new Map(project.assumptions.map(assumption => [assumption.id, assumption]));
  for (const path of project.paths) {
    path.assumptionIds = [...new Set(path.assumptionIds)];
    if (path.assumptionIds.some(id => !assumptions.has(id))) throw new Error('A path refers to a missing assumption.');
  }
  for (const assumption of project.assumptions) {
    assumption.pathIds = [...new Set(assumption.pathIds)];
    if (assumption.pathIds.some(id => !paths.has(id))) throw new Error('An assumption refers to a missing path.');
  }
  if (project.experiments.some(experiment => !paths.has(experiment.pathId))) throw new Error('An experiment refers to a missing path.');
  if (project.evidence.some(evidence => evidence.assumptionId && !assumptions.has(evidence.assumptionId))) throw new Error('Evidence refers to a missing assumption.');
  // Older saved explorations could record a newly added link in just one direction.
  // Retain that connection and restore the matching link rather than lose the record.
  for (const path of project.paths) {
    for (const id of path.assumptionIds) {
      const assumption = assumptions.get(id)!;
      if (!assumption.pathIds.includes(path.id)) assumption.pathIds.push(path.id);
    }
  }
  for (const assumption of project.assumptions) {
    for (const id of assumption.pathIds) {
      const path = paths.get(id)!;
      if (!path.assumptionIds.includes(assumption.id)) path.assumptionIds.push(assumption.id);
    }
  }
  return project;
}
export function toMarkdown(p: StudioProject): string {
  const pathNames = (ids: string[]) => ids.map(id => p.paths.find(path => path.id === id)?.title || id).join(', ') || 'None recorded';
  return `# ${p.title}\n\n> ${p.vision}\n\n${p.thesis}\n\nCreated with Whatloom. Origin: ${p.origin}. All possibilities remain hypotheses until investigated.\n\nArea: ${p.domain}\nCreated: ${p.createdAt}\nUpdated: ${p.updatedAt}\n\n## Context\n${p.context || 'No context recorded.'}\n\n## Constraints\n${p.constraints.length ? p.constraints.map(constraint => `- ${constraint}`).join('\n') : 'No constraints recorded.'}\n\n## Possible paths\n${p.paths.map(path => `### ${path.title}\n${path.subtitle}\n\n${path.description}\n\n**Horizon:** ${path.horizon}\n\n**Mechanism:** ${path.mechanism}\n\n**Opportunity:** ${path.opportunity}\n\n**Unresolved constraint:** ${path.obstacle}\n\n**First move:** ${path.firstMove}\n`).join('\n')}\n## Assumptions\n${p.assumptions.map(a=>`- [${a.status}] ${a.text}\n  ${a.whyItMatters}\n  Connected paths: ${pathNames(a.pathIds)}`).join('\n')}\n\n## Evidence\n${p.evidence.length ? p.evidence.map(e=>`### ${e.title}\n${e.url}\n${e.excerpt}\n\nType: ${e.kind}; position: ${e.stance}\nConnected assumption: ${e.assumptionId ? p.assumptions.find(a=>a.id===e.assumptionId)?.text || e.assumptionId : 'General context'}\nAdded: ${e.addedAt}`).join('\n\n') : 'No evidence recorded.'}\n\n## First proofs\n${p.experiments.map(e=>`### ${e.title} (${e.status})\nConnected path: ${pathNames([e.pathId])}\n\n${e.method}\n\nPass/fail: ${e.successSignal}\n\nResult: ${e.result || 'Not recorded.'}`).join('\n\n')}\n\n## Possible ecosystem\n${p.ecosystem.map(s=>`- ${s}`).join('\n')}\n\n## Field notes\n${p.notes || 'No notes yet.'}\n`;
}
export function researchBrief(p: StudioProject): string { return `Research this proposed future: ${p.vision}\n\nContext: ${p.context}\n\nFind direct competitors, substitutes, failed attempts and enabling capabilities. Prefer primary sources. Actually open each source. Separate facts from inference, include direct URLs and dates, and look for evidence against the thesis. Do not invent demand or market size.\n\nAssumptions to investigate:\n${p.assumptions.map(a=>`- ${a.text}`).join('\n')}`; }
export function downloadFile(name: string, content: string, type: string) { const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url), 2000); }
export function safeUrl(value: string): string | undefined { try { const url = new URL(value); return ['http:','https:'].includes(url.protocol) ? url.href : undefined; } catch { return undefined; } }
export function futureCard(p: StudioProject): string {
  const esc = (s:string) => s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
  const words = p.vision.replace(/^what if\s*/i,'').split(' '); const lines:string[]=[]; let line=''; words.forEach(w=>{if((line+' '+w).length>36){lines.push(line);line=w;}else line+=(line?' ':'')+w;});if(line)lines.push(line);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="#F6F4EE"/><circle cx="1090" cy="90" r="230" fill="#D7F06F"/><path d="M985 35v60a35 35 0 0070 0V35v60a35 35 0 0070 0V35" fill="none" stroke="#242720" stroke-width="13"/><text x="76" y="90" font-family="Helvetica,Arial,sans-serif" font-size="28" font-weight="700" fill="#242720">whatloom</text><text x="76" y="180" font-family="Helvetica,Arial,sans-serif" font-size="15" letter-spacing="4" fill="#73796B">A FUTURE WORTH EXPLORING</text><text x="76" y="255" font-family="Georgia,serif" font-size="64" fill="#242720">What if...</text>${lines.slice(0,4).map((l,i)=>`<text x="76" y="${330+i*68}" font-family="Georgia,serif" font-size="56" fill="#242720">${esc(l)}</text>`).join('')}<line x1="76" y1="640" x2="1124" y2="640" stroke="#D6D7CE"/>${p.paths.slice(0,3).map((path,i)=>`<circle cx="${86+i*357}" cy="687" r="5" fill="${['#8B9E3A','#ACA1CD','#D69C80'][i]}"/><text x="${104+i*357}" y="693" font-family="Helvetica,Arial,sans-serif" font-size="18" fill="#242720">${esc(path.title.slice(0,31))}</text>`).join('')}<text x="76" y="755" font-family="Helvetica,Arial,sans-serif" font-size="15" fill="#73796B">Make room for what could be.</text><text x="1124" y="755" text-anchor="end" font-family="Helvetica,Arial,sans-serif" font-size="15" fill="#73796B">An exploration, not a prediction.</text></svg>`;
}

export async function downloadFuturePng(p: StudioProject): Promise<void> {
  const source = URL.createObjectURL(new Blob([futureCard(p)], {type:'image/svg+xml'}));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => { img.onload=()=>resolve(); img.onerror=()=>reject(new Error('The future card could not be rendered.')); img.src=source; });
    const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=800;
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Image export is unavailable in this browser.');
    ctx.drawImage(img,0,0);
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Image export could not finish.')),'image/png'));
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${p.title.slice(0,45)}-future.png`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
  } finally {URL.revokeObjectURL(source);}
}
