import type { InventionPath, StudioProject } from './studio-types';

export type ScenarioAction = 'map' | 'compare' | 'path' | 'edit-path' | 'assumptions' | 'evidence' | 'add-evidence' | 'proofs' | 'notes' | 'ecosystem' | 'share' | 'reframe' | 'library' | 'import';

export interface ScenarioStep {
  id: string;
  title: string;
  instruction: string;
  expected: string;
  action: ScenarioAction;
  actionLabel: string;
  practiceText?: string;
}

export interface Scenario {
  id: string;
  title: string;
  domain: string;
  value: string;
  summary: string;
  duration: string;
  outcome: string;
  steps: ScenarioStep[];
  seed: Omit<StudioProject, 'id' | 'createdAt' | 'updatedAt' | 'origin'>;
}

type PathDraft = Omit<InventionPath, 'id' | 'color' | 'assumptionIds'>;
type ScenarioDraft = Omit<Scenario, 'seed'> & {
  vision: string;
  thesis: string;
  context: string;
  constraints: string[];
  ecosystem: string[];
  paths: PathDraft[];
  assumptions: { text: string; whyItMatters: string; paths: number[] }[];
  proofs: { title: string; method: string; successSignal: string }[];
  notes?: string;
};

function defineScenario(draft: ScenarioDraft): Scenario {
  const colors = ['lime', 'lavender', 'peach'] as const;
  const paths = draft.paths.map((path, index) => ({
    ...path,
    id: `${draft.id}-p${index + 1}`,
    color: colors[index],
    assumptionIds: draft.assumptions.flatMap((assumption, i) => assumption.paths.includes(index) ? [`${draft.id}-a${i + 1}`] : []),
  }));
  return {
    id: draft.id, title: draft.title, domain: draft.domain, value: draft.value,
    summary: draft.summary, duration: draft.duration, outcome: draft.outcome, steps: draft.steps,
    seed: {
      title: draft.title, vision: draft.vision, thesis: draft.thesis, domain: draft.domain,
      context: `Illustrative scenario. No customer interviews, competitor research, or experiments have been conducted. ${draft.context}`,
      constraints: draft.constraints, paths,
      assumptions: draft.assumptions.map((assumption, index) => ({
        id: `${draft.id}-a${index + 1}`, text: assumption.text, whyItMatters: assumption.whyItMatters,
        status: 'untested', pathIds: assumption.paths.map(i => paths[i].id),
      })),
      experiments: draft.proofs.map((proof, index) => ({ ...proof, id: `${draft.id}-e${index + 1}`, pathId: paths[index].id, status: 'planned', result: '' })),
      evidence: [], ecosystem: draft.ecosystem,
      notes: draft.notes || 'Practice workspace. All starting content is illustrative. Label any fictional rehearsal clearly; record real findings only after gathering them.',
    },
  };
}

export const SCENARIOS: Scenario[] = [
  defineScenario({
    id: 'food-without-waste', title: 'Dinner without the waste', domain: 'Food systems',
    value: 'Compare different mechanisms',
    summary: 'Explore three ways to help a household use the food it already has, then make a reasoned choice.',
    duration: '5 minutes', outcome: 'A preferred mechanism and an explicit reason to investigate it.',
    vision: 'What if making dinner helped a household use what it already had?',
    thesis: 'A reminder, a neighborhood exchange, and a different purchasing arrangement change different causes of waste. Compare their tradeoffs before choosing a product.',
    context: 'Imagine a two-person household with a small fridge, variable work hours, and no appetite for logging every ingredient.',
    constraints: ['No daily inventory entry', 'Use existing phones and paper for the first trial', 'Do not assume neighbors want to exchange food'],
    ecosystem: ['Recipe adaptation', 'Food handling guidance', 'Neighborhood hosts', 'Flexible portion suppliers'],
    paths: [
      { title: 'A use-it-first ritual', subtitle: 'Change the moment a meal is chosen.', description: 'Put a visible use-first shelf and a short meal-choice ritual ahead of shopping.', mechanism: 'Make a few perishable ingredients salient when someone decides what to cook, without maintaining a full inventory.', opportunity: 'A household could make one useful decision with less record keeping.', obstacle: 'The cue must fit real evenings and remain visible when plans change.', firstMove: 'Rehearse three dinner decisions with a paper use-first card and record where the ritual creates work.', horizon: 'Now' },
      { title: 'A small exchange circle', subtitle: 'Move surplus to someone who can use it.', description: 'Coordinate a narrowly defined exchange among consenting neighbors.', mechanism: 'A host matches a surplus offer with a recipient and an agreed collection window.', opportunity: 'An unwanted ingredient could become useful without changing the original meal plan.', obstacle: 'Trust, food handling, and the effort of collection may outweigh the benefit.', firstMove: 'Interview potential hosts about one low-risk exchange category before arranging any exchange.', horizon: 'Next' },
      { title: 'Portions that flex', subtitle: 'Change how ingredients are purchased.', description: 'Explore an advance order where households choose smaller or adjustable portions.', mechanism: 'Aggregate planned orders so a supplier can offer a bounded range of portion sizes.', opportunity: 'A household could buy closer to what it expects to use.', obstacle: 'Smaller portions and coordination may add cost or packaging.', firstMove: 'Model one ingredient order with a willing supplier using actual costs before offering it.', horizon: 'Later' },
    ],
    assumptions: [
      { text: 'A short cue can influence the dinner decision without a full inventory.', whyItMatters: 'The first path depends on changing a specific moment.', paths: [0] },
      { text: 'Neighbors will accept the proposed exchange and collection arrangements.', whyItMatters: 'An exchange needs willing participants on both sides.', paths: [1] },
      { text: 'A supplier can vary portion size at an acceptable cost.', whyItMatters: 'The purchasing model depends on operational economics.', paths: [2] },
      { text: 'The extra effort is smaller than the benefit for the participating household.', whyItMatters: 'Every path competes with doing nothing differently.', paths: [0, 1, 2] },
    ],
    proofs: [
      { title: 'Rehearse a dinner decision', method: 'Use a paper card during three staged meal decisions. Record time, confusion, and whether a listed ingredient enters the plan.', successSignal: 'Before starting, agree that at least two decisions must use the card without adding more than two minutes. These are proposed thresholds, not findings.' },
      { title: 'Check an exchange boundary', method: 'Ask three potential participants to review a proposed exchange category, collection window, and handling rules.', successSignal: 'Proceed only if a host and two participants independently agree on the same bounded process; this does not prove demand.' },
      { title: 'Price a flexible portion', method: 'Ask one supplier to review a sample order and itemize preparation, packaging, and coordination costs.', successSignal: 'Record a supplier-reviewed cost for one feasible portion size before testing a paid offer.' },
    ],
    steps: [
      { id: 'see-the-options', title: 'Find the causal difference', instruction: 'Read the three paths. Identify which changes a habit, which changes a handoff, and which changes a purchase.', expected: 'Three different mechanisms, rather than three versions of the same app.', action: 'map', actionLabel: 'Open possibility map' },
      { id: 'compare-tradeoffs', title: 'Compare the friction', instruction: 'Turn on Compare paths. Compare the mechanism and unresolved constraint for all three options.', expected: 'A clear tradeoff you can explain without ranking the ideas by how exciting they sound.', action: 'compare', actionLabel: 'Compare paths' },
      { id: 'inspect-first-move', title: 'Look at the smallest beginning', instruction: 'Open A use-it-first ritual. Read its first move and the assumptions connected to it.', expected: 'A practical starting point that still has untested assumptions.', action: 'path', actionLabel: 'Inspect a path' },
      { id: 'record-choice', title: 'Make a provisional choice', instruction: 'Write the path you would investigate first, why it fits the household, and what would change your mind. This is a decision rehearsal, not validation.', expected: 'A saved reason for choosing one approach over the alternatives.', action: 'notes', actionLabel: 'Record your reasoning', practiceText: 'Practice decision: I would investigate the use-first ritual because ___. I would reconsider if ___.' },
    ],
  }),
  defineScenario({
    id: 'commute-without-car', title: 'The last mile, reconsidered', domain: 'Mobility',
    value: 'Trace an assumption through a system',
    summary: 'Challenge a fictional scheduling assumption and see which approaches need another look.',
    duration: '5 minutes', outcome: 'A challenged assumption linked to the paths it could change.',
    vision: 'What if a shift worker had a practical alternative to driving the last mile?',
    thesis: 'Timing, shared transport, and employer support could each change a different part of the journey. Their dependencies should remain visible.',
    context: 'Imagine a workplace beside a transit stop with one remaining connection. The route, demand, accessibility needs, and employer support are all unknown.',
    constraints: ['Do not assume employees can move a shift start', 'No live road or transport trial during this exercise', 'Begin with route planning and participant conversations'],
    ecosystem: ['Workplace coordinators', 'Accessibility reviewers', 'Transport operators', 'Route information maintainers'],
    paths: [
      { title: 'A better connection window', subtitle: 'Coordinate arrival and start times.', description: 'Explore whether a small timing change can remove a missed connection.', mechanism: 'A workplace and its employees agree on a bounded connection window rather than each person solving the mismatch alone.', opportunity: 'A worker might complete the journey with existing services.', obstacle: 'Shift times or transit schedules may be fixed.', firstMove: 'Map a hypothetical shift and connection on paper, then list whose permission a timing change would require.', horizon: 'Now' },
      { title: 'A shared last-mile service', subtitle: 'Pool a specific journey.', description: 'Investigate a small group with compatible destinations and accessibility requirements.', mechanism: 'Aggregate a clearly defined journey so an existing licensed operator can evaluate serving it.', opportunity: 'A group could share coordination and booking effort.', obstacle: 'Compatible times, service quality, cost, and access must be established.', firstMove: 'Ask a transport operator to critique an illustrative journey brief without booking a service.', horizon: 'Next' },
      { title: 'Support the journey', subtitle: 'Change what an employer funds.', description: 'Explore a bounded employer contribution to an employee-selected connection.', mechanism: 'An agreed budget and eligibility rule shift some of the cost of a reliable journey to the organization benefiting from arrival.', opportunity: 'Workers could choose an option that fits their circumstances.', obstacle: 'Budget ownership and fair eligibility need agreement.', firstMove: 'Review a hypothetical contribution rule with a workplace coordinator and identify unanswered policy questions.', horizon: 'Later' },
    ],
    assumptions: [
      { text: 'The workplace can adjust a shift start to match a connection.', whyItMatters: 'The timing approach fails if the shift cannot move.', paths: [0] },
      { text: 'A small group has compatible journeys and access requirements.', whyItMatters: 'Pooling depends on compatibility rather than proximity alone.', paths: [1] },
      { text: 'An employer has a reason and a workable process to fund a connection.', whyItMatters: 'A subsidy needs an owner, budget, and acceptable rules.', paths: [2] },
      { text: 'Workers prefer the proposed arrangement to their current routine.', whyItMatters: 'A technically possible connection may still be inconvenient.', paths: [0, 1, 2] },
      { text: 'The proposed connection can meet the required arrival window.', whyItMatters: 'A useful route must fit the actual work obligation.', paths: [0, 1, 2] },
    ],
    proofs: [
      { title: 'Map a fixed shift', method: 'Compare a paper journey under a movable shift and a fixed shift. List the permissions and gaps for each.', successSignal: 'Identify at least one feasible connection window and its permission owner before proposing a real trial.' },
      { title: 'Check operator fit', method: 'Present a bounded sample journey to an operator and ask about capacity, accessibility, and costs.', successSignal: 'Obtain an explicit list of conditions under which the operator would consider a trial; no booking is implied.' },
      { title: 'Review a contribution rule', method: 'Ask a workplace coordinator to mark unclear or unacceptable parts of a sample support policy.', successSignal: 'Identify a decision owner and unresolved fairness questions before asking employees to participate.' },
    ],
    steps: [
      { id: 'identify-dependency', title: 'Find the brittle assumption', instruction: 'Locate the assumption about changing a shift start. Read which path it is connected to.', expected: 'The timing dependency is explicit rather than hidden inside a promising idea.', action: 'assumptions', actionLabel: 'Inspect assumptions' },
      { id: 'practice-challenge', title: 'Rehearse a challenge', instruction: 'For this fictional exercise, set that assumption to Challenged. This is a practice flag, not a finding about any real workplace.', expected: 'A challenged status that calls for review; no evidence or experiment is automatically created.', action: 'assumptions', actionLabel: 'Challenge an assumption', practiceText: 'Fictional practice condition: the shift start cannot change. No workplace has been interviewed.' },
      { id: 'trace-impact', title: 'Follow the connection', instruction: 'Return to the map, inspect the review flag, and open the timing path. Compare its dependency with the other two paths.', expected: 'You can explain which mechanism the challenge directly affects.', action: 'map', actionLabel: 'Trace affected paths' },
      { id: 'separate-practice', title: 'Keep the exercise honest', instruction: 'Record that the challenge was hypothetical. If you continue this project for real, return the status to Untested until you gather relevant evidence.', expected: 'A note distinguishes an imagined constraint from an observed result.', action: 'notes', actionLabel: 'Label the rehearsal', practiceText: 'Fictional practice: I challenged the shift-time assumption to inspect its connections. No real scheduling evidence has been collected.' },
    ],
  }),
  defineScenario({
    id: 'wardrobe-repairs', title: 'A second life for a favorite jacket', domain: 'Circular fashion',
    value: 'Research alternatives without inventing evidence',
    summary: 'Frame a competitor question, add a carefully labeled research item, and find it again in the evidence library.',
    duration: '6 minutes', outcome: 'A source-backed finding or an explicitly labeled question to investigate.',
    vision: 'What if repairing a favorite item of clothing felt easier than replacing it?',
    thesis: 'Guidance, service coordination, and a maintenance offer could remove different obstacles. Investigate what a person already does before assuming a missing product.',
    context: 'Imagine someone with a jacket needing a minor repair. We do not yet know whether the obstacle is diagnosis, price, access, or preference.',
    constraints: ['No invented competitor descriptions', 'Inspect an original source before making a source claim', 'Keep questions separate from customer observations'],
    ecosystem: ['Repair specialists', 'Material and part suppliers', 'Care instructions', 'Collection hosts'],
    paths: [
      { title: 'A repair decision guide', subtitle: 'Reduce uncertainty before a booking.', description: 'Help a person prepare clear questions and photographs for a repair specialist.', mechanism: 'A constrained intake turns an ambiguous repair request into information a human specialist can review.', opportunity: 'A person could understand the next step before committing to a service.', obstacle: 'A photograph may not reveal the condition or repairability of the item.', firstMove: 'Ask a repair specialist to review three staged intake descriptions and mark missing information.', horizon: 'Now' },
      { title: 'A neighborhood repair route', subtitle: 'Make the handoff easier.', description: 'Coordinate a small collection and return route with an existing specialist.', mechanism: 'Batch a bounded set of repairs so collection effort is shared across participants.', opportunity: 'A specialist and a household could spend less time arranging individual handoffs.', obstacle: 'Custody, quality, pricing, and return timing need explicit ownership.', firstMove: 'Map a proposed handoff with a specialist before accepting any garments.', horizon: 'Next' },
      { title: 'Care over ownership', subtitle: 'Explore a bounded repair membership.', description: 'Investigate a service offer covering a defined repair category rather than unlimited repairs.', mechanism: 'An advance fee funds a narrow care commitment with explicit exclusions and cost limits.', opportunity: 'A person might find routine care easier to plan.', obstacle: 'Repair frequency and cost must be understood before pricing a commitment.', firstMove: 'Ask a specialist to cost a sample repair category and challenge the offer boundaries.', horizon: 'Later' },
    ],
    assumptions: [
      { text: 'Uncertainty about the repair is a meaningful obstacle for the intended user.', whyItMatters: 'A guide is useful only if uncertainty blocks action.', paths: [0] },
      { text: 'Batching collection creates enough benefit to justify the coordination.', whyItMatters: 'A new handoff can add friction rather than remove it.', paths: [1] },
      { text: 'A narrow care commitment can be priced using observed repair costs.', whyItMatters: 'The offer must survive actual use.', paths: [2] },
      { text: 'The proposed approach adds something useful beyond existing alternatives.', whyItMatters: 'Competitors and manual workarounds may already solve the important part.', paths: [0, 1, 2] },
    ],
    proofs: [
      { title: 'Review an intake', method: 'Have a specialist mark what is missing from three staged repair requests.', successSignal: 'Agree on a minimum information checklist before testing the intake with real customers.' },
      { title: 'Walk the handoff on paper', method: 'Trace collection, identification, repair approval, payment, and return for one illustrative item.', successSignal: 'Every handoff has an agreed owner before accepting a real item.' },
      { title: 'Bound the care offer', method: 'Itemize a sample repair category using supplier input and list exclusions.', successSignal: 'A specialist can identify the cost drivers and conditions under which they would consider the offer.' },
    ],
    steps: [
      { id: 'define-research-question', title: 'Ask about the current alternative', instruction: 'Find the assumption about existing alternatives. Choose one concrete question, such as whether a service offers collection or explains repair eligibility.', expected: 'A research question that a source could answer without claiming customer demand.', action: 'assumptions', actionLabel: 'Choose a research question' },
      { id: 'inspect-evidence', title: 'Start with an empty record', instruction: 'Open Evidence. No competitor findings have been supplied. If researching now, open an official page of a service you choose in another tab.', expected: 'A clean distinction between a prompt to research and a verified source.', action: 'evidence', actionLabel: 'Open evidence' },
      { id: 'record-carefully', title: 'Add a finding or a question', instruction: 'If you opened a source, add its URL and a narrow paraphrase as External source, with relationship Adds context. Otherwise select Hypothesis, title it Question to research, and leave the URL empty. Do not label a rehearsal as a real observation.', expected: 'One manually saved item whose type and wording accurately describe what you know.', action: 'add-evidence', actionLabel: 'Add a research item', practiceText: 'Question to research — hypothesis only: Does an existing service already provide a convenient collection and return process for this repair category?' },
      { id: 'find-it-again', title: 'Keep the source connected', instruction: 'Open the evidence library. Find your item, check its type, and return to this exploration using its project link.', expected: 'A reusable research record connected to the idea it informs.', action: 'library', actionLabel: 'Find it in the library' },
    ],
  }),
  defineScenario({
    id: 'borrowed-tools', title: 'The tool you need for an afternoon', domain: 'Making',
    value: 'Design a small proof before building',
    summary: 'Replace a large platform plan with a bounded experiment and a signal you can actually observe.',
    duration: '5 minutes', outcome: 'A revised experiment with a method, threshold, and honest planned status.',
    vision: 'What if someone could finish a small home project without buying another tool?',
    thesis: 'Borrowing, supervised access, and a completed task are different offers. A small test should establish which outcome matters before a platform is built.',
    context: 'Imagine a neighborhood organizer with access to a community room. No tool inventory, lending permissions, insurance, or participant demand has been established.',
    constraints: ['Use a paper or tabletop rehearsal first', 'No live tool operation during this exercise', 'Do not assume a lending policy or coverage exists'],
    ecosystem: ['Tool owners', 'Instruction providers', 'Maintenance specialists', 'Community space hosts'],
    paths: [
      { title: 'A hosted borrowing shelf', subtitle: 'Share access to a defined inventory.', description: 'Explore a small, permission-based inventory managed by a named host.', mechanism: 'A checkout record and return agreement replace individual search and negotiation for each item.', opportunity: 'A resident could locate an occasional-use item without buying it.', obstacle: 'Permission, maintenance, loss, and responsibility need clear terms.', firstMove: 'Run a paper checkout rehearsal with photos of three hypothetical items.', horizon: 'Now' },
      { title: 'An afternoon making session', subtitle: 'Share a place and guidance.', description: 'Explore a supervised session around one low-risk project category.', mechanism: 'Combine access, guidance, and a time slot so the participant need not manage each ingredient separately.', opportunity: 'A beginner could evaluate a project with a knowledgeable host.', obstacle: 'Facilitation effort and safe operating boundaries must be understood.', firstMove: 'Rehearse registration and project selection without operating tools.', horizon: 'Next' },
      { title: 'Buy the finished task', subtitle: 'Make access unnecessary.', description: 'Explore a bounded service that delivers the small outcome rather than lending equipment.', mechanism: 'A provider quotes and completes a clearly defined task using their own equipment.', opportunity: 'A resident who wants the result could avoid the learning and ownership burden.', obstacle: 'Scope ambiguity and service costs may make small jobs impractical.', firstMove: 'Ask a suitable provider to critique a sample task brief and quote structure.', horizon: 'Later' },
    ],
    assumptions: [
      { text: 'A defined borrowing process is easier than the resident’s current workaround.', whyItMatters: 'A shelf must remove enough effort to matter.', paths: [0] },
      { text: 'A host can facilitate the proposed session within acceptable boundaries.', whyItMatters: 'Access and guidance require time and responsibility.', paths: [1] },
      { text: 'A provider can define and quote the small task without excessive overhead.', whyItMatters: 'A service must work at the scale of the intended job.', paths: [2] },
      { text: 'The participant values the proposed outcome enough to take the first step.', whyItMatters: 'Interest alone does not establish participation.', paths: [0, 1, 2] },
      { text: 'The first test can reveal a meaningful failure without building software.', whyItMatters: 'The experiment should reduce uncertainty cheaply.', paths: [0, 1, 2] },
    ],
    proofs: [
      { title: 'Rehearse a checkout', method: 'Give three consenting participants a paper inventory of hypothetical items. Ask each to choose an item and explain the proposed return process.', successSignal: 'Proposed threshold: all three can explain the return process without prompting. Adjust this threshold before running a real test.' },
      { title: 'Rehearse a session booking', method: 'Ask three participants to choose between two illustrative project descriptions and a proposed time slot. Record confusion and unanswered questions.', successSignal: 'Identify whether the descriptions and boundaries are understood before arranging any physical session.' },
      { title: 'Review one task brief', method: 'Ask a provider to mark the missing details in a sample small-job request.', successSignal: 'A provider identifies a bounded scope and the information required to consider a quote.' },
    ],
    steps: [
      { id: 'choose-uncertainty', title: 'Pick one unknown', instruction: 'Read the borrowing path and identify the uncertainty that a paper checkout could expose.', expected: 'One testable question instead of a full product specification.', action: 'path', actionLabel: 'Inspect the borrowing path' },
      { id: 'edit-method', title: 'Make the test smaller', instruction: 'In First proofs, edit Rehearse a checkout so it names participants, materials, task, and what you will observe. Keep it as a plan.', expected: 'A method someone else could carry out without guessing.', action: 'proofs', actionLabel: 'Write the experiment' },
      { id: 'define-signal', title: 'Define the signal first', instruction: 'Edit What would count as a signal? Decide what result would cause you to continue or change the approach. The suggested threshold is a practice choice, not a benchmark.', expected: 'An observable threshold set before the test, with status still Planned and no invented result.', action: 'proofs', actionLabel: 'Set a pass or fail signal' },
      { id: 'record-next-action', title: 'Leave a real next action', instruction: 'Write whom you would ask to review the plan and which permission is needed. Leave What happened? empty until the experiment actually runs.', expected: 'A next action and a clean boundary between planning and results.', action: 'notes', actionLabel: 'Record the next action', practiceText: 'Planned next step: ask ___ to review the paper rehearsal. Permission needed: ___. No experiment has run.' },
    ],
  }),
  defineScenario({
    id: 'calm-first-day', title: 'A calmer first day', domain: 'Work',
    value: 'Preserve context and decision reasoning',
    summary: 'Keep the creator’s constraints, an unresolved disagreement, and a provisional decision in one durable workspace.',
    duration: '4 minutes', outcome: 'Field notes that explain the decision and the context behind it.',
    vision: 'What if a new teammate knew how to ask for help on their first day?',
    thesis: 'Clear information, a human relationship, and a smaller work task could each make a first day more navigable. The right approach depends on the team’s actual context.',
    context: 'Fictional creator brief: a team lead can change a welcome document and ask for one volunteer buddy, but cannot buy new software. New-hire needs and manager capacity remain unknown.',
    constraints: ['No new software budget', 'Do not publish employee information', 'Begin with a fictional role and a review exercise'],
    ecosystem: ['Team leads', 'Volunteer buddies', 'Role information owners', 'Accessibility reviewers'],
    paths: [
      { title: 'A first-day field guide', subtitle: 'Make the next question easy to place.', description: 'Prepare a concise, role-specific guide to people, decisions, and common questions.', mechanism: 'Replace a large information dump with a small map of where to ask for what.', opportunity: 'A new teammate could find the next useful person or document.', obstacle: 'A guide becomes misleading when ownership or information changes.', firstMove: 'Ask an unfamiliar reviewer to find three answers in a fictional role guide.', horizon: 'Now' },
      { title: 'A welcome partnership', subtitle: 'Give uncertainty a human destination.', description: 'Explore a voluntary buddy arrangement with clear time boundaries.', mechanism: 'A named person helps interpret the environment and routes questions that documents cannot answer.', opportunity: 'A newcomer could ask uncertain questions with less coordination effort.', obstacle: 'The arrangement depends on availability and a comfortable relationship.', firstMove: 'Rehearse the boundaries of a buddy role with one volunteer using fictional questions.', horizon: 'Next' },
      { title: 'One useful first contribution', subtitle: 'Learn the environment by doing.', description: 'Design a small, reversible task with a clear reviewer and a useful outcome.', mechanism: 'A bounded contribution exposes the people and information needed for real work.', opportunity: 'A teammate could build practical context rather than consume every document first.', obstacle: 'The task can become frustrating if prerequisites or review time are hidden.', firstMove: 'Have a colleague unfamiliar with the task identify its missing prerequisites.', horizon: 'Now' },
    ],
    assumptions: [
      { text: 'The guide can stay accurate with an identified owner.', whyItMatters: 'Useful context requires maintenance.', paths: [0] },
      { text: 'A volunteer buddy can provide bounded help consistently.', whyItMatters: 'A relationship needs realistic time expectations.', paths: [1] },
      { text: 'A first contribution can be useful without requiring broad access or expertise.', whyItMatters: 'A starter task must fit the person’s actual beginning.', paths: [2] },
      { text: 'The newcomer can identify when and where to ask for help.', whyItMatters: 'Every path should make uncertainty easier to navigate.', paths: [0, 1, 2] },
    ],
    proofs: [
      { title: 'Find three answers', method: 'Give a fictional role guide to an unfamiliar colleague and ask them to locate three specific help routes.', successSignal: 'Proposed threshold: the colleague can identify the right route for all three questions, with every ambiguity recorded.' },
      { title: 'Rehearse the buddy boundary', method: 'Use fictional requests to decide which questions a buddy handles and which require another owner.', successSignal: 'The volunteer can explain the escalation boundary and a realistic time commitment.' },
      { title: 'Expose task prerequisites', method: 'Ask a reviewer to walk through a reversible fictional starter task and mark missing access, information, or review steps.', successSignal: 'Every prerequisite has an explicit owner before a real newcomer receives the task.' },
    ],
    notes: 'Decision journal\n\nWhat context shapes this choice?\nWhat are we disagreeing about?\nWhat would change the decision?\nWho should review the next step?\n\nNo real employee observations have been recorded.',
    steps: [
      { id: 'recover-context', title: 'Recover the creator’s context', instruction: 'In Field notes, open Original context. Notice the budget and the limited changes the team lead can make.', expected: 'A decision grounded in the supplied fictional brief.', action: 'notes', actionLabel: 'Read the original context' },
      { id: 'inspect-fit', title: 'Check the fit', instruction: 'Compare the three paths against the no-new-software constraint. Choose one to investigate without assuming the other approaches are wrong.', expected: 'A provisional choice based on a concrete constraint.', action: 'compare', actionLabel: 'Compare against the context' },
      { id: 'keep-disagreement', title: 'Keep a useful disagreement', instruction: 'Write an objection to your preferred path, who could clarify it, and what answer would change your choice. Label any imagined viewpoint as fictional practice.', expected: 'Reasoning that a future collaborator can inspect rather than reconstruct.', action: 'notes', actionLabel: 'Write a decision note', practiceText: 'Practice decision: investigate ___. Fictional objection: ___. We need to ask ___ about ___. We would change course if ___.' },
      { id: 'export-reasoning', title: 'Carry the context out', instruction: 'Open Share / export and download the Exploration brief. Check that it includes the context and your field notes.', expected: 'A readable Markdown brief that preserves the reason for the decision.', action: 'share', actionLabel: 'Export the exploration brief' },
    ],
  }),
  defineScenario({
    id: 'learning-after-hours', title: 'Learning after hours', domain: 'Learning',
    value: 'Discover complementary ecosystem opportunities',
    summary: 'Follow the dependencies around a learning experience and find useful roles beyond the first product.',
    duration: '5 minutes', outcome: 'A dependency, its potential owner, and a question for a complementary opportunity.',
    vision: 'What if an adult could turn an evening of curiosity into something they can actually do?',
    thesis: 'A project kit, a shared practice group, and an independent demonstration solve different parts of a learning journey. Their supporting roles may be opportunities in their own right.',
    context: 'Imagine an adult with two evenings available and interest in one creative skill. Skill level, preferred support, and the value of recognition are unknown.',
    constraints: ['One narrow skill', 'No claim that engagement proves competence', 'Keep the first project within two evenings'],
    ecosystem: ['Project material suppliers', 'Mentor scheduling', 'Practice-space hosts', 'Accessible instructions', 'Independent reviewers', 'Portfolio portability'],
    paths: [
      { title: 'A two-evening project kit', subtitle: 'Bring the materials and sequence together.', description: 'Explore a constrained project with materials, instructions, and a clear stopping point.', mechanism: 'Reduce preparation work so the learner can begin practicing a specific skill.', opportunity: 'Someone could try a meaningful project before committing to a course.', obstacle: 'Completion may conceal gaps in understanding.', firstMove: 'Ask a reviewer to try the instructions and then attempt a different small task using the same skill.', horizon: 'Now' },
      { title: 'A practice circle', subtitle: 'Make feedback and continuity a shared activity.', description: 'Explore a small group with a facilitator and a bounded practice schedule.', mechanism: 'Recurring peer explanation and feedback make difficulties visible while providing social continuity.', opportunity: 'A learner could gain feedback and a reason to return.', obstacle: 'Facilitation and uneven participation may add substantial effort.', firstMove: 'Rehearse a short feedback session around an illustrative project with volunteer reviewers.', horizon: 'Next' },
      { title: 'A demonstration that travels', subtitle: 'Make a skill legible outside the session.', description: 'Explore a portable record paired with a practical demonstration and a reviewer’s criteria.', mechanism: 'Show a specific capability through an observable task rather than attendance alone.', opportunity: 'A learner could communicate what they can do to another person.', obstacle: 'Review criteria must be meaningful and applied consistently.', firstMove: 'Have two reviewers critique the same proposed demonstration criteria before assessing learners.', horizon: 'Later' },
    ],
    assumptions: [
      { text: 'The project can teach a narrow skill within the proposed time.', whyItMatters: 'A bounded experience needs a realistic learning goal.', paths: [0] },
      { text: 'Feedback adds enough value to justify facilitation effort.', whyItMatters: 'A practice circle needs a sustainable reason to meet.', paths: [1] },
      { text: 'Independent reviewers can agree on the proposed demonstration criteria.', whyItMatters: 'A portable signal needs an interpretable meaning.', paths: [2] },
      { text: 'Supporting materials, people, and access can be coordinated at a workable cost.', whyItMatters: 'The surrounding ecosystem may determine whether any path is practical.', paths: [0, 1, 2] },
    ],
    proofs: [
      { title: 'Check transfer', method: 'Plan one project and a different follow-up task that requires the same narrow skill.', successSignal: 'Define observable criteria for the follow-up task before inviting learners; completion of the first task alone is insufficient.' },
      { title: 'Rehearse feedback', method: 'Ask volunteer reviewers to give feedback on the same illustrative project within a fixed session length.', successSignal: 'Identify whether the proposed session provides actionable feedback within the available facilitation time.' },
      { title: 'Compare review criteria', method: 'Have two reviewers mark ambiguous parts of a demonstration rubric.', successSignal: 'Revise every disagreement about what counts as a successful demonstration before using the rubric with learners.' },
    ],
    steps: [
      { id: 'follow-a-dependency', title: 'Find what the product depends on', instruction: 'Open the first path. Identify a person, material, or capability that must exist for it to work.', expected: 'A dependency outside the visible product.', action: 'path', actionLabel: 'Inspect the project kit' },
      { id: 'see-ecosystem', title: 'Look beyond the first product', instruction: 'Read What else might become possible? Choose one ecosystem role, such as accessible instructions or mentor scheduling.', expected: 'A complementary opportunity expressed as a hypothesis.', action: 'ecosystem', actionLabel: 'Explore the ecosystem' },
      { id: 'make-role-specific', title: 'Give the role a reason to exist', instruction: 'Write who needs the complementary service, which handoff it improves, and why someone would provide it. Do not assume a market exists.', expected: 'An opportunity with a customer, mechanism, and open question.', action: 'notes', actionLabel: 'Describe a complementary role', practiceText: 'Ecosystem hypothesis: ___ could help ___ by ___. A potential provider would participate because ___. We still need to learn ___.' },
      { id: 'plan-partner-question', title: 'Ask what would have to be true', instruction: 'Open Assumptions. Add one specific belief about your chosen ecosystem role using Add assumption. It remains Untested.', expected: 'The new opportunity becomes an explicit question to investigate.', action: 'assumptions', actionLabel: 'Add an ecosystem assumption' },
    ],
  }),
  defineScenario({
    id: 'music-rehearsal', title: 'Room for one more rehearsal', domain: 'Arts',
    value: 'Make an economic mechanism explicit',
    summary: 'Edit who pays, who benefits, and who carries uncertainty in a creative-space offer.',
    duration: '5 minutes', outcome: 'An economic path with explicit responsibilities and an unresolved cost question.',
    vision: 'What if a small music group could access rehearsal space without a long commitment?',
    thesis: 'A clear booking window, a shared hosted session, and prepaid access distribute effort and financial uncertainty differently. Explain the arrangement before writing a feature list.',
    context: 'Imagine a community venue considering occasional rehearsal access. Available hours, staffing, sound limits, equipment, and participant willingness to pay remain unknown.',
    constraints: ['Use an existing venue', 'No promise of unlimited access', 'Do not invent occupancy, prices, or margins'],
    ecosystem: ['Venue hosts', 'Booking coordinators', 'Equipment maintainers', 'Session facilitators'],
    paths: [
      { title: 'A bounded rehearsal pass', subtitle: 'Trade commitment for defined access.', description: 'Explore a pass covering a fixed number of sessions under clear conditions.', mechanism: 'Participants prepay for specified access; the venue commits to honoring a limited capacity obligation.', opportunity: 'A group could plan a few sessions while the venue gains an advance commitment.', obstacle: 'Unused capacity, cancellations, staffing, and refunds create financial uncertainty.', firstMove: 'Write a hypothetical pass and ask a venue host to identify every cost and obligation.', horizon: 'Later' },
      { title: 'An open-hours window', subtitle: 'Make existing capacity easier to request.', description: 'Explore a manually confirmed booking window with explicit access rules.', mechanism: 'A venue publishes a small set of available sessions and confirms fit before taking a booking.', opportunity: 'A group could evaluate an occasional session without negotiating a long agreement.', obstacle: 'Available time may not align with the group’s needs or venue staffing.', firstMove: 'Ask a venue host to review three illustrative booking requests.', horizon: 'Now' },
      { title: 'A hosted rehearsal exchange', subtitle: 'Share the coordination and the session.', description: 'Explore a facilitated session where compatible groups share a room and a schedule.', mechanism: 'A host coordinates time, equipment boundaries, and setup between participants.', opportunity: 'Participants might share preparation effort and gain a place to practice.', obstacle: 'Compatibility and facilitation costs may erase the benefit.', firstMove: 'Rehearse a proposed session schedule with a host on paper.', horizon: 'Next' },
    ],
    assumptions: [
      { text: 'The venue has usable sessions that align with participant needs.', whyItMatters: 'Unfilled space is not automatically useful capacity.', paths: [0, 1, 2] },
      { text: 'A host can coordinate a shared session within the available time.', whyItMatters: 'The exchange depends on practical facilitation.', paths: [2] },
      { text: 'A group values a bounded pass enough to commit in advance.', whyItMatters: 'The pass depends on a particular tradeoff.', paths: [0] },
      { text: 'The venue can cover the obligations of the offer using observed costs.', whyItMatters: 'A compelling story is insufficient to establish sustainable economics.', paths: [0, 1, 2] },
      { text: 'Cancellation and access terms are understandable to both sides.', whyItMatters: 'Unclear responsibility can damage trust and create unexpected costs.', paths: [0, 1] },
    ],
    proofs: [
      { title: 'Challenge the pass economics', method: 'Write a proposed number of sessions, obligations, cancellation rule, and cost worksheet for host review.', successSignal: 'The host can identify the inputs needed to price the offer without relying on invented usage or margin estimates.' },
      { title: 'Review a booking request', method: 'Ask a host to review three fictional requests and list the information required to accept or decline each.', successSignal: 'Each request can be resolved using a bounded list of questions before a real booking is offered.' },
      { title: 'Rehearse a shared schedule', method: 'Walk through setup, room access, practice time, and cleanup with a venue host.', successSignal: 'Every transition fits the agreed schedule and has an owner; no session has yet run.' },
    ],
    steps: [
      { id: 'compare-risk', title: 'Compare where uncertainty sits', instruction: 'Compare the three paths. Notice which depends on an individual booking, a host’s coordination, or an advance commitment.', expected: 'An explanation of different arrangements, rather than different payment screens.', action: 'compare', actionLabel: 'Compare the arrangements' },
      { id: 'open-pass', title: 'Inspect the bounded pass', instruction: 'Open A bounded rehearsal pass, the first path. Read the mechanism and unresolved constraint.', expected: 'The pass is a hypothesis with financial obligations, not a promise of profitability.', action: 'path', actionLabel: 'Open the rehearsal pass' },
      { id: 'edit-economics', title: 'State who carries what', instruction: 'Use Edit path on the rehearsal pass. In How it could work, name who pays, what they receive, and who carries cancellation or unused-capacity risk. Use illustrative terms rather than invented market prices.', expected: 'An edited economic mechanism with explicit responsibilities.', action: 'edit-path', actionLabel: 'Edit the economic path', practiceText: 'Illustrative offer: a group pays for ___ defined sessions. The venue provides ___. If a session is cancelled, ___ is responsible for ___. These terms still need review.' },
      { id: 'keep-cost-unknown', title: 'Leave one cost question visible', instruction: 'Record the cost input you would need before setting a real price, and who could supply it.', expected: 'A concrete financial uncertainty and a next research step.', action: 'notes', actionLabel: 'Record the missing input', practiceText: 'Before pricing this offer, we need observed ___ costs from ___. No price, margin, or demand has been validated.' },
    ],
  }),
  defineScenario({
    id: 'water-without-sensors', title: 'A garden without new sensors', domain: 'Climate',
    value: 'Explore a changed constraint safely',
    summary: 'Record a new condition in a separate guided exploration while preserving the original reasoning.',
    duration: '5 minutes', outcome: 'A separate guided framework with the changed condition recorded.',
    vision: 'What if caring for a small shared garden used less guesswork and less unnecessary watering?',
    thesis: 'Observation cues, shared stewardship, and a different planting service change different sources of effort. A constraint can reveal which questions the original paths avoided.',
    context: 'Imagine one shared raised bed with a volunteer coordinator. Weather, plant needs, current watering habits, and site permissions are unknown.',
    constraints: ['One raised bed only', 'No automated valve control', 'No claim of water savings without measurement'],
    ecosystem: ['Garden stewards', 'Site coordinators', 'Local horticultural guidance', 'Accessible observation tools'],
    paths: [
      { title: 'A visible observation cue', subtitle: 'Connect an observation to a decision.', description: 'Explore a simple, reviewable cue that helps a steward decide when to seek advice or water.', mechanism: 'A small set of observations makes the decision process visible without taking control away from the steward.', opportunity: 'A volunteer could have a clearer reason for the next action.', obstacle: 'A simple cue may be unreliable across plants and conditions.', firstMove: 'Ask a knowledgeable reviewer to critique a paper observation card before any watering trial.', horizon: 'Now' },
      { title: 'A shared stewardship round', subtitle: 'Make responsibility visible.', description: 'Explore a shared schedule and handoff note for garden care.', mechanism: 'Named responsibility and a common record reduce uncertainty about who checked the garden and what they saw.', opportunity: 'Volunteers might avoid duplicated or missed tasks.', obstacle: 'A schedule still depends on participation and clear handoffs.', firstMove: 'Rehearse a one-week responsibility schedule with fictional observations.', horizon: 'Next' },
      { title: 'Design for the care available', subtitle: 'Change what the garden asks of people.', description: 'Explore a planning service that matches planting and maintenance choices to the care a site can actually support.', mechanism: 'Adjust the design and agreed care plan rather than continually improving reminders.', opportunity: 'A group could choose a garden it is prepared to maintain.', obstacle: 'Site conditions and appropriate planting choices require qualified local review.', firstMove: 'Prepare a site-question checklist for a local horticultural reviewer.', horizon: 'Later' },
    ],
    assumptions: [
      { text: 'A simple observation can inform a useful care decision in the chosen bed.', whyItMatters: 'The cue requires a defined context and a checkable meaning.', paths: [0] },
      { text: 'Volunteers can sustain a clear schedule and handoff record.', whyItMatters: 'Coordination needs continuing participation.', paths: [1] },
      { text: 'A suitable planting and care plan can fit the site’s actual capabilities.', whyItMatters: 'Design choices need informed local review.', paths: [2] },
      { text: 'The first approach can work without automated control.', whyItMatters: 'The pilot must fit the stated boundary.', paths: [0, 1, 2] },
      { text: 'The group can establish a baseline before making a savings claim.', whyItMatters: 'A claimed outcome needs a relevant comparison.', paths: [0, 1, 2] },
    ],
    proofs: [
      { title: 'Review an observation card', method: 'Ask a qualified local reviewer to mark where a draft card could mislead a steward.', successSignal: 'Clarify its limits and escalation questions before any live care decision is based on the card.' },
      { title: 'Rehearse the handoff', method: 'Use fictional entries to walk through a one-week stewardship schedule without making care changes.', successSignal: 'Each scheduled check has an owner and an unambiguous place to record a missed visit.' },
      { title: 'Define a site brief', method: 'Prepare site and care-capacity questions for a knowledgeable reviewer.', successSignal: 'The reviewer can identify the missing inputs needed to consider a planting plan.' },
    ],
    steps: [
      { id: 'inspect-original', title: 'Notice the original boundaries', instruction: 'Read the map and the observation path. The current idea has no evidence of water savings.', expected: 'The original mechanisms and their limits are clear.', action: 'map', actionLabel: 'Read the original map' },
      { id: 'record-reframe-reason', title: 'Name what the condition should expose', instruction: 'In Field notes, write why removing new hardware and internet access might change the approach.', expected: 'A reason for exploring a different constraint.', action: 'notes', actionLabel: 'Record the question', practiceText: 'Hypothetical reframe: what would still be useful if the garden had no new sensors and no internet access? We have not tested this condition.' },
      { id: 'compare-before-branch', title: 'Keep the original alternatives in view', instruction: 'Compare the three original paths and note which could potentially survive the new condition. This is your reasoning, not an AI result.', expected: 'A provisional prediction to revisit later.', action: 'compare', actionLabel: 'Compare original paths' },
      { id: 'create-new-framework', title: 'Create a separate guided exploration', instruction: 'Use Change a condition. Enter the practice condition and choose Guided studio. The hosted app records it in a new framework; it does not generate tailored new solutions. The original project stays intact.', expected: 'A new guided project containing the changed condition and questions for you to work through.', action: 'reframe', actionLabel: 'Change a condition', practiceText: 'No new sensors can be installed, and the garden has no internet access.' },
    ],
  }),
  defineScenario({
    id: 'weekend-together', title: 'A small reason to meet', domain: 'Community',
    value: 'Communicate a possibility visually',
    summary: 'Shape a short, understandable idea and export a PNG future card without turning a hypothesis into a promise.',
    duration: '4 minutes', outcome: 'A shareable PNG plus a clear question for the person receiving it.',
    vision: 'What if neighbors could find a small, welcoming reason to meet on a weekend?',
    thesis: 'A bounded activity, a rotating host, and shared access could each make a gathering easier to imagine. A visual invitation should open a conversation while keeping its uncertainties honest.',
    context: 'Imagine a neighborhood volunteer considering a small weekend activity. We have not established participant interest, accessibility needs, a venue, or permission.',
    constraints: ['No attendance or demand claims', 'No public event is created by this exercise', 'Confirm access and permission before any real invitation'],
    ecosystem: ['Volunteer hosts', 'Accessible venues', 'Activity facilitators', 'Community information channels'],
    paths: [
      { title: 'A tiny activity sampler', subtitle: 'Make the first step concrete.', description: 'Explore one bounded activity with a clear duration and a low commitment.', mechanism: 'A specific, understandable invitation reduces uncertainty about what participating would involve.', opportunity: 'A neighbor could decide whether one activity fits them.', obstacle: 'An appealing description does not establish a comfortable or accessible experience.', firstMove: 'Ask three reviewers what they expect from a fictional invitation and what is unclear.', horizon: 'Now' },
      { title: 'A rotating host circle', subtitle: 'Share the work of making it happen.', description: 'Explore a small set of hosts with explicit roles and a repeatable format.', mechanism: 'Rotate a bounded responsibility so one person is not the permanent coordinator.', opportunity: 'A group could maintain continuity without relying on a single organizer.', obstacle: 'Reliability and the burden on each host need to be understood.', firstMove: 'Walk through a fictional hosting rotation and identify gaps in responsibility.', horizon: 'Next' },
      { title: 'A shared access pot', subtitle: 'Pool a defined cost transparently.', description: 'Explore an optional, bounded contribution toward an agreed venue or activity cost.', mechanism: 'Participants agree on a specific shared expense and a clear rule for spending or returning contributions.', opportunity: 'A group might access an activity that is awkward to arrange individually.', obstacle: 'Fairness, handling contributions, and unused funds require explicit rules.', firstMove: 'Ask reviewers to critique a fictional contribution and refund rule without collecting money.', horizon: 'Later' },
    ],
    assumptions: [
      { text: 'The invitation makes the activity understandable without overstating it.', whyItMatters: 'Communication should help someone make an informed choice.', paths: [0] },
      { text: 'Hosts can share a bounded responsibility reliably.', whyItMatters: 'A repeating format needs a practical owner for each task.', paths: [1] },
      { text: 'Participants can agree on a transparent shared-cost arrangement.', whyItMatters: 'Pooling requires trust and clear handling of money.', paths: [2] },
      { text: 'A suitable venue and an accessible format can be arranged.', whyItMatters: 'A welcoming description needs a workable setting.', paths: [0, 1, 2] },
    ],
    proofs: [
      { title: 'Check invitation comprehension', method: 'Ask three reviewers to describe a fictional activity after reading its invitation.', successSignal: 'Each can identify the activity, duration, and an unanswered access question; this does not validate attendance.' },
      { title: 'Walk a host rotation', method: 'Assign fictional preparation, welcome, and cleanup tasks across a proposed rotation.', successSignal: 'Every task has one clear owner before any actual gathering is organized.' },
      { title: 'Review shared-cost rules', method: 'Have reviewers mark unclear responsibilities in a hypothetical contribution and refund rule.', successSignal: 'Every concern about unused funds and authority is explicit before collecting any money.' },
    ],
    steps: [
      { id: 'read-as-a-newcomer', title: 'Read the idea as a newcomer', instruction: 'Look at the map. Say the proposed future aloud in one sentence, without promising attendance or success.', expected: 'A possibility that another person can understand.', action: 'map', actionLabel: 'Read the possibility' },
      { id: 'keep-uncertainty', title: 'Keep an uncertainty beside the story', instruction: 'Open the activity path and choose one obstacle that should remain part of the conversation.', expected: 'A compelling idea with a visible unanswered question.', action: 'path', actionLabel: 'Inspect the first path' },
      { id: 'prepare-question', title: 'Choose the conversation you want', instruction: 'In Field notes, write one question to ask the recipient. Do not treat praise for the card as evidence that the activity will work.', expected: 'A reason to share beyond collecting reactions.', action: 'notes', actionLabel: 'Write the recipient’s question', practiceText: 'Question to ask with this card: What would you need to know before deciding whether this activity fits you? No responses have been collected.' },
      { id: 'save-png', title: 'Give the possibility a visual form', instruction: 'Open Share / export, preview the future card, and download Future card as PNG. Check the downloaded image before sharing it yourself.', expected: 'A PNG saved to your device. Nothing is published or sent automatically.', action: 'share', actionLabel: 'Export a PNG future card' },
    ],
  }),
  defineScenario({
    id: 'neighborhood-observatory', title: 'A neighborhood observatory', domain: 'Citizen science',
    value: 'Hand off a project without losing its reasoning',
    summary: 'Prepare a portable project, export a JSON backup, and import a separate copy with its relationships intact.',
    duration: '5 minutes', outcome: 'A portable backup and a separately imported project ready for another browser or the Mac app.',
    vision: 'What if neighbors could compare everyday nature observations without losing how each observation was made?',
    thesis: 'A shared observation protocol, a coordinated round, and pooled equipment change different barriers to participation. A useful handoff should preserve the questions and the method as well as the idea.',
    context: 'Imagine a volunteer group considering non-invasive observations from public or permitted spaces. No scientific findings, participant commitments, or data quality have been established.',
    constraints: ['No organism collection or disturbance', 'Do not expose private locations', 'No scientific conclusion without an appropriate method and review'],
    ecosystem: ['Protocol reviewers', 'Local space coordinators', 'Equipment stewards', 'Data format maintainers'],
    paths: [
      { title: 'A common observation card', subtitle: 'Keep the method beside the record.', description: 'Explore a small protocol that asks people to record a defined observation and the conditions around it.', mechanism: 'A shared definition and context fields make observations easier to interpret and compare.', opportunity: 'A group could notice when two records are not directly comparable.', obstacle: 'Consistency and interpretation require informed review.', firstMove: 'Ask a knowledgeable reviewer to critique a fictional observation form.', horizon: 'Now' },
      { title: 'A coordinated observation round', subtitle: 'Align time and method across volunteers.', description: 'Explore a bounded round with shared instructions, permission boundaries, and a named coordinator.', mechanism: 'Coordinate when and how a group observes so variation in procedure is visible.', opportunity: 'Participants could practice a method together and identify confusion.', obstacle: 'Scheduling, access, and variation in observation skill may limit comparability.', firstMove: 'Rehearse a round using fictional records rather than collecting real data.', horizon: 'Next' },
      { title: 'A shared equipment kit', subtitle: 'Make a capability available without ownership.', description: 'Explore a loan kit with instructions, a calibration question, and a return process.', mechanism: 'Pool access to a bounded set of equipment while keeping its use and condition documented.', opportunity: 'A volunteer could try a method without buying equipment first.', obstacle: 'Maintenance, access, and measurement quality need explicit responsibility.', firstMove: 'Have a reviewer walk through a hypothetical checkout and record the missing instructions.', horizon: 'Later' },
    ],
    assumptions: [
      { text: 'The proposed protocol produces records that a reviewer can interpret consistently.', whyItMatters: 'Comparable-looking data may hide different methods.', paths: [0, 1] },
      { text: 'Volunteers can follow the shared procedure within permitted access boundaries.', whyItMatters: 'A coordinated round needs feasible participation.', paths: [1] },
      { text: 'A kit can be maintained and its limitations explained by an identified steward.', whyItMatters: 'Shared equipment requires care and context.', paths: [2] },
      { text: 'Another person can continue the project from the saved questions and methods.', whyItMatters: 'A handoff needs the reasoning, not only an appealing title.', paths: [0, 1, 2] },
    ],
    proofs: [
      { title: 'Review a protocol', method: 'Ask a knowledgeable reviewer to mark ambiguous fields in a fictional observation form.', successSignal: 'Every field has a clear meaning and a documented limitation before real data collection.' },
      { title: 'Rehearse one round', method: 'Walk volunteer reviewers through fictional records made under different conditions.', successSignal: 'The group can identify which records should not be directly compared and why.' },
      { title: 'Review a kit handoff', method: 'Have a reviewer read a hypothetical kit checkout, instruction, and return process.', successSignal: 'Every equipment and method question has an owner before a real kit is offered.' },
    ],
    steps: [
      { id: 'leave-handoff-note', title: 'Tell the next person where to start', instruction: 'In Field notes, identify the unresolved protocol question and the reviewer you would seek. Keep names hypothetical if no one has agreed to participate.', expected: 'A next reader can find the decision that still needs attention.', action: 'notes', actionLabel: 'Prepare the handoff note', practiceText: 'Handoff note: this is an illustrative project with no collected data. Next, ask a qualified reviewer about ___. Do not infer scientific findings from these proposed methods.' },
      { id: 'check-state', title: 'Check the work’s actual state', instruction: 'Open First proofs. Confirm the experiments remain Planned and What happened? is empty unless you have actually run a test.', expected: 'The backup will preserve a plan without invented completion.', action: 'proofs', actionLabel: 'Review planned proofs' },
      { id: 'export-backup', title: 'Export the portable project', instruction: 'Open Share / export and download Portable backup, the JSON file. Keep this file to transfer the project to another browser or the Mac app.', expected: 'A JSON backup containing paths, linked assumptions, notes, and planned proofs.', action: 'share', actionLabel: 'Export a JSON backup' },
      { id: 'reimport-copy', title: 'Practice the handoff', instruction: 'Select the JSON backup you just downloaded. Open the imported copy and check its field notes and linked assumptions. You can also import the same file in another browser or the Mac app.', expected: 'A separately imported project with the original reasoning intact; the original exploration remains available.', action: 'import', actionLabel: 'Import your JSON backup' },
    ],
  }),
];

export function getScenario(id: string): Scenario | undefined {
  return SCENARIOS.find(scenario => scenario.id === id);
}

function freshId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createScenarioProject(id: string): StudioProject {
  const scenario = getScenario(id);
  if (!scenario) throw new Error(`Unknown scenario: ${id}`);
  const seed = structuredClone(scenario.seed);
  const records = [...seed.paths, ...seed.assumptions, ...seed.experiments, ...seed.evidence];
  const ids = new Map(records.map(record => [record.id, freshId()]));
  const remap = (oldId: string) => {
    const newId = ids.get(oldId);
    if (!newId) throw new Error(`Scenario ${id} contains a missing record reference.`);
    return newId;
  };
  const timestamp = new Date().toISOString();
  return {
    ...seed, id: freshId(), createdAt: timestamp, updatedAt: timestamp, origin: 'example',
    paths: seed.paths.map(path => ({ ...path, id: remap(path.id), assumptionIds: path.assumptionIds.map(remap) })),
    assumptions: seed.assumptions.map(assumption => ({ ...assumption, id: remap(assumption.id), pathIds: assumption.pathIds.map(remap) })),
    experiments: seed.experiments.map(experiment => ({ ...experiment, id: remap(experiment.id), pathId: remap(experiment.pathId) })),
    evidence: seed.evidence.map(evidence => ({ ...evidence, id: remap(evidence.id), assumptionId: evidence.assumptionId ? remap(evidence.assumptionId) : undefined })),
  };
}
