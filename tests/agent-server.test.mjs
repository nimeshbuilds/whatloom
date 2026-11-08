import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  AgentError, apiError, authorizeLocalRequest, buildAgentArgs, classifyProviderFailure,
  discoverExecutable, explorationSchema, exploreInputSchema, extractProviderPayload,
  openedSourceUrls, readRequestJson, researchSchema, runBoundedProcess, verifyResearchSources,
} from '../lib/agent-server.ts';

function fixture() {
  const colors = ['lime', 'lavender', 'peach'];
  return {
    title: 'Local manufacturing', thesis: 'Removing coordination costs could enable local production.',
    paths: colors.map((color, index) => ({
      id: `p${index}`, title: `Mechanism ${index}`, subtitle: 'A specific path', description: 'A different way to make the vision possible.',
      mechanism: 'Change the economics of coordination.', opportunity: 'A first customer use case.', obstacle: 'Quality remains uncertain.',
      firstMove: 'Deliver one production run manually.', horizon: 'Now', color, assumptionIds: [`a${index * 2}`, `a${index * 2 + 1}`],
    })),
    assumptions: Array.from({ length: 6 }, (_, index) => ({ id: `a${index}`, text: 'A customer will accept a specified tradeoff.', whyItMatters: 'This determines feasibility.', status: 'untested', pathIds: [`p${Math.floor(index / 2)}`] })),
    ecosystem: ['Inspection services', 'Local suppliers', 'Design compatibility'],
    experiments: colors.map((_, index) => ({ id: `e${index}`, title: 'Deliver one prototype', method: 'Make one batch for a real customer.', successSignal: 'The batch meets the agreed tolerance and delivery time.', result: '', status: 'planned', pathId: `p${index}` })),
  };
}

function request(options = {}) {
  return new Request(options.url || 'http://127.0.0.1:4310/api/explore', {
    method: 'POST', headers: { host: '127.0.0.1:4310', origin: 'http://127.0.0.1:4310', 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', ...options.headers }, body: options.body || '{}',
  });
}

test('mutation authorization accepts only the matching local browser origin', () => {
  assert.doesNotThrow(() => authorizeLocalRequest(request(), true));
  assert.doesNotThrow(() => authorizeLocalRequest(request({ url: 'http://localhost:4310/api/explore' }), true));
  assert.doesNotThrow(() => authorizeLocalRequest(request({ url: 'http://localhost:4310/api/agents' })));
  assert.throws(() => authorizeLocalRequest(request({ headers: { origin: 'https://elsewhere.example' } }), true), (error) => error.code === 'ORIGIN_REJECTED');
  assert.throws(() => authorizeLocalRequest(request({ headers: { origin: 'null' } }), true), (error) => error.code === 'ORIGIN_REJECTED');
  assert.throws(() => authorizeLocalRequest(request({ headers: { 'sec-fetch-site': 'cross-site' } }), true), (error) => error.status === 403);
  assert.throws(() => authorizeLocalRequest(request({ url: 'http://attacker.example:4310/api/explore', headers: { host: 'attacker.example:4310', origin: 'http://attacker.example:4310' } }), true), (error) => error.code === 'LOCAL_ONLY');
  assert.throws(() => authorizeLocalRequest(request({ headers: { host: 'attacker.example:4310' } }), true), (error) => error.code === 'LOCAL_ONLY');
  assert.throws(() => authorizeLocalRequest(request({ headers: { host: '127.0.0.1:9999' } }), true), (error) => error.code === 'LOCAL_ONLY');
  assert.throws(() => authorizeLocalRequest(request({ headers: { host: 'localhost.evil.example:4310' } }), true), (error) => error.code === 'LOCAL_ONLY');
  assert.throws(() => authorizeLocalRequest(request({ headers: { host: '127.0.0.1:4310@attacker.example' } }), true), (error) => error.code === 'LOCAL_ONLY');
});

test('bounded JSON reader rejects oversized and malformed bodies', async () => {
  await assert.rejects(readRequestJson(request({ body: JSON.stringify({ text: 'a'.repeat(100) }) }), 30), (error) => error.status === 413);
  await assert.rejects(readRequestJson(request({ headers: { 'content-length': '500' } }), 30), (error) => error.code === 'INPUT_TOO_LARGE');
  await assert.rejects(readRequestJson(request({ body: '{no' })), (error) => error.status === 400);
  assert.deepEqual(await readRequestJson(request({ body: '{"vision":"A future"}' })), { vision: 'A future' });
});

test('input schema accepts a bounded brief and rejects unknown providers and extra fields', () => {
  const brief = { provider: 'codex', vision: 'Create useful new capabilities.', context: '', domain: '', constraints: [] };
  assert.equal(exploreInputSchema.parse(brief).provider, 'codex');
  assert.equal(exploreInputSchema.safeParse({ ...brief, provider: '../../bad' }).success, false);
  assert.equal(exploreInputSchema.safeParse({ ...brief, executable: '/bin/sh' }).success, false);
  assert.equal(exploreInputSchema.safeParse({ ...brief, context: 'x'.repeat(10001) }).success, false);
});

test('exploration schema requires consistent hypothesis relationships and no fabricated evidence', () => {
  assert.equal(explorationSchema.safeParse(fixture()).success, true);
  const broken = fixture();
  broken.paths[0].assumptionIds.push('missing');
  assert.equal(explorationSchema.safeParse(broken).success, false);
  const contradicted = fixture();
  contradicted.assumptions[0].status = 'supported';
  assert.equal(explorationSchema.safeParse(contradicted).success, false);
  const evidence = { ...fixture(), evidence: [{ title: 'An invented customer interview' }] };
  assert.equal(explorationSchema.safeParse(evidence).success, false);
  const duplicate = fixture();
  duplicate.paths[1].id = duplicate.paths[0].id;
  assert.equal(explorationSchema.safeParse(duplicate).success, false);
  const missingExperiment = fixture();
  missingExperiment.experiments[1].pathId = 'p0';
  assert.equal(explorationSchema.safeParse(missingExperiment).success, false);
});

test('provider adapters preserve structured output and reject malformed or failed responses', () => {
  const data = fixture();
  const codex = [{ type: 'thread.started', thread_id: 'test' }, { type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(data) } }, { type: 'turn.completed' }].map(JSON.stringify).join('\n');
  assert.deepEqual(extractProviderPayload('codex', codex).payload, data);
  assert.deepEqual(extractProviderPayload('claude', JSON.stringify({ type: 'result', is_error: false, structured_output: data })).payload, data);
  assert.throws(() => extractProviderPayload('codex', 'not structured'), (error) => error.code === 'INVALID_AGENT_OUTPUT');
  assert.throws(() => extractProviderPayload('claude', JSON.stringify({ type: 'result', is_error: true, result: 'Not logged in' })), (error) => error.code === 'AUTH_REQUIRED');
  assert.throws(() => extractProviderPayload('codex', JSON.stringify({ type: 'turn.failed', error: { message: 'Rate limit reached' } })), (error) => error.code === 'PROVIDER_LIMIT');
});

test('agent arguments isolate local tools and enable only native research when requested', () => {
  const codex = buildAgentArgs('codex', {}, '/tmp/schema.json');
  assert.ok(codex.includes('--ignore-user-config'));
  assert.ok(codex.includes('--ephemeral'));
  assert.ok(codex.includes('features.shell_tool=false'));
  assert.ok(codex.includes('web_search="disabled"'));
  assert.ok(!codex.includes('--dangerously-bypass-approvals-and-sandbox'));
  const research = buildAgentArgs('codex', {}, '/tmp/schema.json', true);
  assert.ok(research.includes('web_search="live"'));
  const claude = buildAgentArgs('claude', {}, '/tmp/schema.json');
  assert.equal(claude[claude.indexOf('--tools') + 1], '');
  assert.ok(claude.includes('--safe-mode'));
  assert.ok(!claude.includes('--bare'));
  assert.ok(claude.includes('--strict-mcp-config'));
  const claudeResearch = buildAgentArgs('claude', {}, '/tmp/schema.json', true);
  assert.equal(claudeResearch[claudeResearch.indexOf('--tools') + 1], 'WebSearch,WebFetch');
  assert.equal(claudeResearch[claudeResearch.indexOf('--max-turns') + 1], '10');
});

test('CLI discovery follows executable PATH entries and common local paths', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'whatloom-test-'));
  try {
    const executable = join(directory, 'codex');
    await writeFile(executable, '#!/bin/sh\nexit 0\n');
    await chmod(executable, 0o700);
    assert.equal(await discoverExecutable('codex', { path: directory, home: directory }), executable);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('bounded process runner sends input without a shell and reports exit status', async () => {
  const value = 'literal $(do-not-execute) `do-not-execute`\n';
  const result = await runBoundedProcess(process.execPath, ['-e', 'process.stdin.pipe(process.stdout)'], { cwd: tmpdir(), input: value, timeoutMs: 3000 });
  assert.equal(result.stdout, value);
  assert.equal(result.exitCode, 0);
  const failed = await runBoundedProcess(process.execPath, ['-e', 'process.exit(7)'], { cwd: tmpdir(), timeoutMs: 3000 });
  assert.equal(failed.exitCode, 7);
});

test('bounded process runner stops timeouts, output overflow, and cancelled requests', async () => {
  await assert.rejects(runBoundedProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { cwd: tmpdir(), timeoutMs: 60 }), (error) => error.code === 'TIMEOUT');
  await assert.rejects(runBoundedProcess(process.execPath, ['-e', 'process.stdout.write("x".repeat(10000))'], { cwd: tmpdir(), maxOutputBytes: 100, timeoutMs: 3000 }), (error) => error.code === 'OUTPUT_TOO_LARGE');
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(runBoundedProcess(process.execPath, [], { cwd: tmpdir(), signal: controller.signal }), (error) => error.code === 'CANCELLED');
});

test('provider failures expose helpful categories without leaking stderr content', async () => {
  assert.equal(classifyProviderFailure('401 token expired secret_token').code, 'AUTH_REQUIRED');
  assert.equal(classifyProviderFailure('quota exceeded').code, 'PROVIDER_LIMIT');
  assert.equal(classifyProviderFailure('unknown option --safe-mode').code, 'UPDATE_REQUIRED');
  const response = apiError(classifyProviderFailure('Unexpected internal detail secret_token'));
  assert.ok(!(await response.text()).includes('secret_token'));
  assert.equal(apiError(new AgentError('BUSY', 'Wait.', 429)).status, 429);
});

test('research validation rejects local, credentialed and non-HTTP citations', () => {
  const evidence = { title: 'Official product page', url: 'https://example.com/product', excerpt: 'The vendor describes an adjacent workflow; actual adoption remains unknown.', stance: 'context', assumptionId: 'a0' };
  assert.equal(researchSchema.safeParse({ evidence: [evidence], summary: 'A limited research pass.' }).success, true);
  for (const url of [
    'file:///etc/passwd', 'http://127.0.0.1:4310', 'http://127.0.0.2', 'http://192.168.1.2',
    'http://100.64.0.1', 'http://169.254.169.254', 'http://172.31.255.255', 'http://198.18.1.1',
    'http://224.0.0.1', 'http://255.255.255.255', 'http://2130706433', 'http://0x7f000001',
    'http://[::1]/', 'http://[::]/', 'http://[::ffff:127.0.0.1]/', 'http://[::ffff:7f00:1]/',
    'http://[::ffff:192.168.1.2]/', 'http://[fd00::1]/', 'http://[fc00::1]/',
    'http://[fe80::1]/', 'http://[fec0::1]/', 'http://[ff02::1]/', 'http://[64:ff9b::7f00:1]/',
    'http://[2002:7f00:1::]/', 'http://[2001:db8::1]/',
    'http://device.local/', 'http://DEVICE.LOCAL./', 'http://device.localhost/',
    'http://device.lan/', 'http://service.internal/', 'http://router.home.arpa/', 'http://printer/',
    'https://user:password@example.com', 'not a URL',
  ]) {
    assert.equal(researchSchema.safeParse({ evidence: [{ ...evidence, url }], summary: 'Test' }).success, false, url);
  }
  for (const url of ['https://example.com/product', 'https://www.openai.com/', 'https://8.8.8.8/', 'https://[2606:4700:4700::1111]/']) {
    assert.equal(researchSchema.safeParse({ evidence: [{ ...evidence, url }], summary: 'Test' }).success, true, url);
  }
});

test('research accepts only citations matching completed native page retrievals', () => {
  const url = 'https://example.com/product';
  const other = 'https://invented.example/product';
  const result = { evidence: [url, other].map((source) => ({ title: 'Product', url: source, excerpt: 'A vendor claim needing review.', stance: 'context', assumptionId: 'a0' })), summary: 'Review these primary sources.' };
  const codexEvents = [{ type: 'item.completed', item: { type: 'web_search', status: 'completed', action: { type: 'open_page', url } } }];
  assert.ok(openedSourceUrls('codex', codexEvents).has(url));
  assert.deepEqual(verifyResearchSources(result, 'codex', codexEvents, ['a0']).evidence.map((source) => source.url), [url]);
  assert.equal(verifyResearchSources(result, 'codex', codexEvents, ['unrelated']).evidence.length, 0);
  assert.throws(() => verifyResearchSources(result, 'codex', [], ['a0']), (error) => error.code === 'RESEARCH_UNAVAILABLE');
  const claudeEvents = [
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'fetch1', name: 'WebFetch', input: { url } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'fetch1', content: 'Opened page' }] } },
  ];
  assert.ok(openedSourceUrls('claude', claudeEvents).has(url));
  claudeEvents[1].message.content[0].is_error = true;
  assert.equal(openedSourceUrls('claude', claudeEvents).size, 0);
});

test('research recognizes the Codex 0.154 native page operation shape observed live', () => {
  const url = 'https://learn.chatgpt.com/docs/non-interactive-mode';
  const events = [
    { type: 'item.completed', item: { id: 'search', type: 'web_search', query: 'site.developers.openai.com codex non-interactive codex exec', action: { type: 'search', query: 'site.developers.openai.com codex non-interactive codex exec' } } },
    { type: 'item.started', item: { id: 'open', type: 'web_search', query: '', action: { type: 'other' } } },
    { type: 'item.completed', item: { id: 'open', type: 'web_search', query: url, action: { type: 'other' } } },
  ];
  assert.deepEqual([...openedSourceUrls('codex', events)], [url]);
  const result = { evidence: [{ title: 'Official CLI documentation', url, excerpt: 'Describes scripted Codex runs.', stance: 'context', assumptionId: 'a1' }], summary: 'Public retrieval test.' };
  assert.equal(verifyResearchSources(result, 'codex', events, ['a1']).evidence.length, 1);
  assert.equal(openedSourceUrls('codex', [{ type: 'item.completed', item: { type: 'web_search', query: url, action: { type: 'search', query: url } } }]).size, 0);
  assert.equal(openedSourceUrls('codex', [{ type: 'item.completed', item: { type: 'web_search', status: 'failed', query: url, action: { type: 'other' } } }]).size, 0);
});
