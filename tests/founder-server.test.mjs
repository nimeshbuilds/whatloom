import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test from 'node:test';
import { AgentError } from '../lib/agent-server.ts';
import { approveFounderProject, createFounderProject, selectFounderIdea, updateFounderProject } from '../lib/founder.ts';
import { assertFounderBuildApproved, cancelFounderBuild, founderBuildArgs, founderBuildInputSchema, founderBuildPrompt, founderPartnerNeedsResearch, founderPartnerPrompt, getFounderBuildJob, partnerInputSchema, prepareFounderBuildBundle, runFounderPartner, startFounderBuild, validatePartnerResult, verifyFounderResearch } from '../lib/founder-server.ts';

function readyProject() {
  let project = createFounderProject('A tool-sharing counter', 'One neighborhood workshop, one willing host.');
  project = selectFounderIdea(project, project.ideas[0].id);
  return updateFounderProject(project, {
    opportunity: { problem: 'Infrequently used tools take space.', audience: 'Neighbors who can reach one workshop.', whyNow: 'A host is willing to run a small trial.', alternatives: 'Buy, rent, borrow informally, or do without.', differentiator: 'A proposed staffed handoff with a clear return process.', assumptions: ['A handoff costs less effort than the borrowing benefit.'] },
    research: { summary: 'One manually reviewed source records an adjacent approach; demand is unknown.', competitors: [{ id: 'c1', name: 'An adjacent tool library', url: 'https://example.org/library', description: 'A recorded alternative.', difference: 'The proposed staffed handoff requires testing.', sourceIds: ['s1'] }], sources: [{ id: 's1', title: 'Source reviewed by creator', url: 'https://example.org/library', note: 'A primary page, manually recorded in this test fixture.', checkedAt: '2026-11-08T12:00:00.000Z', verified: false }], unknowns: ['Willingness to return tools on schedule is unknown.'], researchedAt: null },
    product: { what: 'A small borrowing desk.', who: 'One neighborhood.', why: 'Access to useful tools without ownership.', journeys: ['Choose a tool, agree a return time, and check it back in.'], capabilities: ['Track a bounded inventory and loan.'], success: ['Observe a complete handoff and return in a trial.'], outOfScope: ['No public marketplace in the first version.'] },
    brand: { names: [{ id: 'n1', name: 'Borrowlight', rationale: 'An inviting local place.' }, { id: 'n2', name: 'Neighbor Shelf', rationale: 'A literal alternative.' }], selectedName: 'Borrowlight', tagline: 'Useful things, close by.', personality: ['Clear', 'Welcoming'], palette: { background: '#F6F4EE', text: '#242720', primary: '#526A3A', secondary: '#DCD5E7', accent: '#D7F06F' }, typography: { heading: 'Georgia', body: 'Arial' }, logoConcept: 'Two connected open shelves.' },
  });
}
const approvedProject = () => approveFounderProject(readyProject());
const blankPatch = () => ({ title: null, ideas: null, opportunity: null, research: null, product: null, brand: null });
const opened = url => [{ type: 'item.completed', item: { type: 'web_search', status: 'completed', action: { type: 'other' }, query: url } }];
function researchDraft() {
  return { summary: 'A primary source describes a substitute. Adoption remains unknown.', competitors: [{ id: 'c1', name: 'A recorded substitute', url: 'https://example.org/product', description: 'The vendor describes this workflow.', difference: 'The proposed handoff remains a hypothesis.', sourceIds: ['s1'] }], sources: [{ id: 's1', title: 'Primary product page', url: 'https://example.org/product', note: 'The vendor states its own capabilities; this does not establish demand.' }], unknowns: ['Actual willingness to switch has not been tested.'] };
}
async function waitFinished(id) {
  for (let i = 0; i < 100; i++) {
    const job = getFounderBuildJob(id);
    if (!['queued', 'running'].includes(job.status)) return job;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Fake build did not settle.');
}

test('partner and build inputs bound providers/models and reject unsupported request powers', () => {
  const project = readyProject();
  assert.equal(partnerInputSchema.parse({ project, provider: 'codex', model: 'gpt-example', message: 'Help me clarify the audience.' }).model, 'gpt-example');
  assert.throws(() => partnerInputSchema.parse({ project, provider: 'shell', message: 'hello' }));
  assert.throws(() => partnerInputSchema.parse({ project, provider: 'codex', model: '--unsafe; command', message: 'hello' }));
  assert.throws(() => founderBuildInputSchema.parse({ project, provider: 'codex', directory: '/some/existing/project' }));
});

test('partner uses the selected model with stage-specific product guidance and returns an unapplied draft', async () => {
  const project = { ...readyProject(), stage: 'product' };
  const before = structuredClone(project);
  let call;
  const product = { ...project.product, what: 'A bounded desk for one local borrowing trial.' };
  const result = await runFounderPartner({ project, provider: 'codex', model: 'gpt-example', message: 'Draft the experience.' }, undefined, async (...args) => {
    call = args;
    return { payload: { reply: 'Here is a focused first version.', suggestions: ['What is the first journey?'], patch: { ...blankPatch(), product } }, events: [] };
  });
  assert.equal(call[5], 'gpt-example'); assert.equal(call[4], false);
  assert.ok(call[2].includes(`CURRENT UTC DATE: ${new Date().toISOString().slice(0, 10)}`));
  assert.match(call[2], /ONE URL per native web open call/);
  assert.match(call[2], /search snippet is not an opened page/);
  assert.match(call[2], /technical HOW/); assert.match(founderPartnerPrompt({ project, provider: 'codex', message: 'Draft the experience.' }), /untrusted project\/conversation material/);
  assert.deepEqual(result.patch.product, product); assert.deepEqual(project, before);
  assert.equal(result.researchPerformed, false);
});


test('existing research references do not trigger browsing and build-stage conversation never gains web tools', () => {
  const project = { ...readyProject(), stage: 'product' };
  assert.equal(founderPartnerNeedsResearch({ project, provider: 'codex', message: 'Draft a product brief from our chosen opportunity and research.' }), false);
  assert.equal(founderPartnerNeedsResearch({ project: { ...project, stage: 'review' }, provider: 'codex', message: 'Check gaps across research, product, and brand.' }), false);
  assert.equal(founderPartnerNeedsResearch({ project, provider: 'codex', message: 'Refine my current idea and add a search capability.' }), false);
  assert.equal(founderPartnerNeedsResearch({ project, provider: 'codex', message: 'Research the current competitors from their official websites.' }), true);
  assert.equal(founderPartnerNeedsResearch({ project: { ...project, stage: 'research' }, provider: 'codex', message: 'Please continue.' }), true);
  assert.equal(founderPartnerNeedsResearch({ project: { ...project, stage: 'build' }, provider: 'codex', message: 'Search the web for current competitors.' }), false);
});

test('shortlist changes repair selection references without choosing on the creator’s behalf', () => {
  const project = { ...approvedProject(), stage: 'discover' };
  const result = validatePartnerResult({ reply: 'Consider another direction.', suggestions: [], patch: { ...blankPatch(), ideas: [{ id: 'new', title: 'Another direction', description: 'Still a hypothesis.' }] } }, { project, provider: 'codex', message: 'Suggest another direction.' }, []);
  assert.equal(result.patch.selectedIdeaId, null);
  assert.ok(project.approval);
  const brandProject = { ...project, stage: 'brand' };
  const brandResult = validatePartnerResult({ reply: 'Two directions.', suggestions: [], patch: { ...blankPatch(), brand: { ...project.brand, selectedName: 'AI picked this', names: [{ id: 'new1', name: 'New One', rationale: 'One option.' }, { id: 'new2', name: 'New Two', rationale: 'Another option.' }] } } }, { project: brandProject, provider: 'codex', message: 'Give me two name directions.' }, []);
  assert.equal(brandResult.patch.brand.selectedName, '');
});

test('partner does not turn a tool-free answer into current market research', () => {
  const project = { ...readyProject(), stage: 'research' };
  const result = validatePartnerResult({ reply: 'Invented current market findings.', suggestions: [], patch: { ...blankPatch(), research: researchDraft() } }, { project, provider: 'codex', message: 'Research competitors.' }, []);
  assert.equal(result.patch, undefined); assert.equal(result.researchPerformed, false);
  assert.doesNotMatch(result.reply, /Invented/); assert.match(result.reply, /did not open verifiable/);
});

test('research provenance stamps actual retrievals and rejects invented, private, or dangling sources', () => {
  const at = '2026-11-08T13:00:00.000Z';
  const draft = researchDraft();
  const result = verifyFounderResearch(draft, 'codex', opened('https://example.org/product'), at);
  assert.equal(result.sources[0].verified, true); assert.equal(result.sources[0].checkedAt, at); assert.equal(result.researchedAt, at);
  assert.throws(() => verifyFounderResearch(draft, 'codex', opened('https://example.org/other')), error => error.code === 'UNVERIFIED_RESEARCH');
  assert.throws(() => verifyFounderResearch({ ...draft, sources: [{ ...draft.sources[0], url: 'http://127.0.0.1/secret' }] }, 'codex', opened('http://127.0.0.1/secret')), error => error.code === 'UNVERIFIED_RESEARCH');
  assert.throws(() => verifyFounderResearch({ ...draft, competitors: [{ ...draft.competitors[0], sourceIds: ['missing'] }] }, 'codex', opened('https://example.org/product')), error => error.code === 'UNVERIFIED_RESEARCH');
  assert.throws(() => verifyFounderResearch({ ...draft, competitors: [{ ...draft.competitors[0], url: 'https://not-opened.example.org/' }] }, 'codex', opened('https://example.org/product')), error => error.code === 'UNVERIFIED_RESEARCH');
});

test('draft validation rejects stage changes, fake approval, and malformed document relationships', () => {
  const project = { ...readyProject(), stage: 'product' };
  const input = { project, provider: 'codex', message: 'Write the product brief.' };
  assert.throws(() => validatePartnerResult({ reply: 'Approved.', suggestions: [], patch: { approval: { revision: 1 } } }, input, []), error => error.code === 'INVALID_AGENT_OUTPUT');
  assert.throws(() => validatePartnerResult({ reply: 'A name.', suggestions: [], patch: { ...blankPatch(), brand: project.brand } }, input, []), error => error.code === 'INVALID_STAGE_DRAFT');
});

test('build handoff requires current explicit approval before creating any workspace', async () => {
  const base = await mkdtemp(join(tmpdir(), 'whatloom-approval-test-'));
  try {
    assert.throws(() => assertFounderBuildApproved(readyProject()), error => error.code === 'APPROVAL_REQUIRED');
    const approved = approvedProject();
    assert.equal(assertFounderBuildApproved(approved).approval.revision, approved.revision);
    assert.throws(() => assertFounderBuildApproved({ ...approved, revision: approved.revision + 1 }), error => error.code === 'APPROVAL_REQUIRED');
    await assert.rejects(prepareFounderBuildBundle(readyProject(), join(base, 'not-created')), error => error.code === 'APPROVAL_REQUIRED');
    assert.deepEqual(await readdir(base), []);
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('handoff writes approved product and brand into unique non-overwriting folders', async () => {
  const base = await mkdtemp(join(tmpdir(), 'whatloom-bundle-test-'));
  try {
    await writeFile(join(base, 'existing.txt'), 'keep');
    const first = await prepareFounderBuildBundle(approvedProject(), base);
    const second = await prepareFounderBuildBundle(approvedProject(), base);
    assert.notEqual(first.directory, second.directory); assert.ok(!relative(await realpath(base), first.directory).startsWith('..'));
    assert.equal(await readFile(join(base, 'existing.txt'), 'utf8'), 'keep');
    assert.match(await readFile(join(first.directory, 'WHATLOOM-BUILD.md'), 'utf8'), /approved build handoff/);
    assert.match(await readFile(join(first.directory, 'PRODUCT-BRIEF.md'), 'utf8'), /## What/);
    assert.match(await readFile(join(first.directory, 'brand', 'logo.svg'), 'utf8'), /<svg/);
    assert.equal(JSON.parse(await readFile(join(first.directory, '.whatloom', 'project.json'), 'utf8')).brand.selectedName, 'Borrowlight');
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('builder arguments keep normal workspace permissions and separate model values from shell code', () => {
  const codex = founderBuildArgs('codex', 'gpt-example');
  assert.equal(codex[codex.indexOf('--sandbox') + 1], 'workspace-write');
  assert.equal(codex[codex.indexOf('--model') + 1], 'gpt-example');
  assert.ok(codex.includes('--ignore-user-config'));
  assert.ok(!founderBuildArgs('codex').includes('--model'));
  assert.equal(founderBuildArgs('claude')[founderBuildArgs('claude').indexOf('--permission-mode') + 1], 'acceptEdits');
  assert.doesNotMatch([...codex, ...founderBuildArgs('claude')].join(' '), /dangerously|bypass|skip-permissions|full-auto/);
  assert.match(founderBuildPrompt(), /Do not bypass/); assert.match(founderBuildPrompt(), /Do not leave development servers running/);
});

test('async build jobs expose bounded redacted logs, completion, and cancellation without real agents', async () => {
  const base = await mkdtemp(join(tmpdir(), 'whatloom-job-test-'));
  try {
    let observed;
    const approved = approvedProject();
    const job = await startFounderBuild({ project: approved, provider: 'codex', model: 'gpt-example' }, {
      directoryRoot: base, discover: async () => '/fake/agent',
      execute: async (executable, args, options) => {
        observed = { executable, args, cwd: options.cwd, prompt: options.input, status: JSON.parse(await readFile(join(options.cwd, '.whatloom', 'build-status.json'), 'utf8')), snapshot: JSON.parse(await readFile(join(options.cwd, '.whatloom', 'project.json'), 'utf8')) };
        for (let i = 0; i < 220; i++) options.onOutput(`${JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: `Progress ${i} ${'x'.repeat(600)}` } })}\n`);
        options.onOutput(`api_key=sk-ant-${'a'.repeat(36)}\n`);
        return { stdout: '', stderr: '', exitCode: 0 };
      },
    });
    const complete = await waitFinished(job.id);
    assert.equal(complete.projectRevision, approved.revision); assert.equal(observed.status.projectRevision, approved.revision); assert.equal(observed.snapshot.approval.revision, complete.projectRevision);
    assert.equal(complete.status, 'completed'); assert.equal(observed.cwd, job.directory); assert.equal(observed.executable, '/fake/agent');
    assert.ok(complete.logs.length <= 180); assert.ok(complete.logs.join('\n').length <= 91_000); assert.doesNotMatch(complete.logs.join('\n'), /sk-ant-/); assert.match(complete.logs.join('\n'), /redacted/);
    assert.equal((await cancelFounderBuild(job.id)).status, 'completed');
    const pending = await startFounderBuild({ project: approvedProject(), provider: 'claude' }, {
      directoryRoot: base, discover: async () => '/fake/agent',
      execute: async (_executable, _args, options) => new Promise((_resolve, reject) => {
        const stop = () => reject(new AgentError('CANCELLED', 'cancelled', 499));
        if (options.signal.aborted) stop(); else options.signal.addEventListener('abort', stop, { once: true });
      }),
    });
    await assert.rejects(startFounderBuild({ project: approvedProject(), provider: 'codex' }, { directoryRoot: base, discover: async () => '/fake/agent' }), error => error.code === 'BUILD_BUSY');
    const cancelled = await cancelFounderBuild(pending.id);
    assert.equal(cancelled.status, 'cancelled'); assert.ok(cancelled.completedAt); assert.match(cancelled.logs.join('\n'), /files already created are kept/);
  } finally { await rm(base, { recursive: true, force: true }); }
});
