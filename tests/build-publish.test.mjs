import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { executeBuildCheck, githubPublishTargetSchema, publishFounderImplementation, validateVerificationCommand, verificationManifestExample, verificationManifestSchema, verifyFounderImplementation } from '../lib/build-publish.ts';

const target = { account: 'fixture-founder', owner: 'fixture-labs', repository: 'clear-counter', visibility: 'private' };
const manifest = () => ({ completed: true, summary: 'Implemented a counter and exercised its increment/reset behavior.', checks: [{ name: 'Counter journey', kind: 'test', command: ['node', '--test', 'tests/journey.test.mjs'], covers: ['Increment a counter and reset it to zero.'] }], limitations: ['This fixture checks the counter logic; visual usability needs a human review.'] });
async function fixture() {
  const base = await mkdtemp(join(tmpdir(), 'whatloom-publish-test-')); const directory = join(base, 'app');
  await mkdir(join(directory, '.whatloom'), { recursive: true }); await mkdir(join(directory, 'tests'));
  await writeFile(join(directory, 'counter.mjs'), 'export const increment = value => value + 1;\nexport const reset = () => 0;\n');
  await writeFile(join(directory, 'tests/journey.test.mjs'), "import assert from 'node:assert/strict'; import test from 'node:test'; import {increment,reset} from '../counter.mjs'; test('increment and reset',()=>{assert.equal(increment(1),2);assert.equal(reset(),0)});\n");
  await writeFile(join(directory, 'TESTING.md'), '# Testing\n\nRan node --test tests/journey.test.mjs. Increment and reset assertions passed. Browser usability and accessibility still require a human review.\n');
  await writeFile(join(directory, '.whatloom/verification.json'), JSON.stringify(manifest()));
  return { base, directory, cleanup: () => rm(base, { recursive: true, force: true }) };
}
const realGit = (args, cwd) => executeBuildCheck('/usr/bin/git', args, { cwd, env: { PATH: '/usr/bin:/bin', HOME: cwd, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' }, timeoutMs: 20_000, maxOutputBytes: 500_000 });
async function publisherFixture(item) {
  const remote = join(item.base, 'remote.git'); await mkdir(remote);
  assert.equal((await realGit(['init', '--bare', '--initial-branch=main'], remote)).exitCode, 0);
  let repository = null; let creates = 0; let failPush = false; let pushMessage = 'simulated connection loss'; let pretendPush = false; let unknownCreate = false; const calls = [];
  const assertOwner = async (owner, account) => { assert.equal(owner, target.owner); assert.equal(account, target.account); return { account: { login: target.account }, owner: { login: target.owner, type: 'Organization' } }; };
  const github = async (args, cwd, signal, account) => {
    calls.push({ tool: 'github', args, cwd, account }); assert.equal(account, target.account);
    if (args.includes('POST')) {
      creates++;
      if (unknownCreate) return { stdout: '', stderr: 'network interrupted', exitCode: 1 };
      assert.ok(args.includes(`orgs/${target.owner}/repos`)); assert.ok(args.includes('private=true')); assert.ok(args.includes('auto_init=false'));
      repository = { id: 9321, full_name: `${target.owner}/${target.repository}`, private: true, html_url: `https://github.com/${target.owner}/${target.repository}` };
      return { stdout: JSON.stringify(repository), stderr: '', exitCode: 0 };
    }
    return repository ? { stdout: JSON.stringify(repository), stderr: '', exitCode: 0 } : { stdout: '', stderr: 'HTTP 404 Not Found', exitCode: 1 };
  };
  const githubGit = async (args, cwd, signal, account) => {
    calls.push({ tool: 'git', args, cwd, account }); assert.equal(account, target.account); assert.ok(!args.some(arg => /force|\+refs/.test(arg)));
    if (args[0] === 'push' && failPush) return { stdout: '', stderr: pushMessage, exitCode: 1 };
    if (args[0] === 'push' && pretendPush) return { stdout: 'Everything up to date', stderr: '', exitCode: 0 };
    return realGit(args.map(arg => arg === `https://github.com/${target.owner}/${target.repository}.git` ? remote : arg), cwd);
  };
  return { remote, calls, options: { stateRoot: join(item.base, 'private-state'), assertOwner, github, githubGit }, get creates() { return creates; }, set failPush(value) { failPush = value; }, set pushMessage(value) { pushMessage = value; }, set pretendPush(value) { pretendPush = value; }, set unknownCreate(value) { unknownCreate = value; }, set repository(value) { repository = value; } };
}

test('manifest requires completed implementation and a repeatable journey test, with private repository default', () => {
  assert.equal(githubPublishTargetSchema.parse({ account: 'founder', owner: 'org', repository: 'new-product' }).visibility, 'private');
  for (const repository of ['../other', '-option', 'bad repo', 'bad.git']) assert.throws(() => githubPublishTargetSchema.parse({ ...target, repository }));
  assert.doesNotThrow(() => verificationManifestSchema.parse(verificationManifestExample()));
  assert.throws(() => verificationManifestSchema.parse({ ...manifest(), completed: false }));
  assert.throws(() => verificationManifestSchema.parse({ ...manifest(), checks: [{ ...manifest().checks[0], kind: 'build' }] }));
  assert.throws(() => verificationManifestSchema.parse({ ...manifest(), checks: [{ ...manifest().checks[0], covers: [] }] }));
});

test('verification only accepts local bounded checks, not arbitrary shells or network commands', () => {
  for (const command of [['node', '--test', 'tests/journey.test.mjs'], ['npm', 'run', 'test:e2e'], ['python3', '-m', 'pytest'], ['go', 'test', './...'], ['cargo', 'test'], ['bun', 'test']]) assert.doesNotThrow(() => validateVerificationCommand(command));
  for (const command of [['sh', '-c', 'echo pass'], ['curl', 'https://example.org'], ['git', 'push'], ['gh', 'auth', 'token'], ['npm', 'install'], ['node', '-e', 'process.exit(0)'], ['node', '/tmp/test.mjs'], ['node', '../other/test.mjs'], ['node', '--import=../other.mjs', 'tests/journey.test.mjs'], ['npm', 'test', '--prefix=/tmp'], ['python', '-c', 'print(1)']]) assert.throws(() => validateVerificationCommand(command), error => error.code === 'UNSAFE_VERIFICATION_COMMAND');
});

test('verification independently runs real assertions and binds the result to implementation bytes', async () => {
  const item = await fixture();
  try {
    const logs = []; const result = await verifyFounderImplementation(item.directory, { onLog: value => logs.push(value) });
    assert.equal(result.passed, true); assert.equal(result.checks[0].exitCode, 0); assert.match(result.filesDigest, /^[a-f0-9]{64}$/); assert.equal(result.fileCount, 3); assert.equal(result.checks[0].covers.length, 1);
    assert.ok(logs.includes('Passed: Counter journey.')); assert.ok(result.limitations.length);
    await writeFile(join(item.directory, 'counter.mjs'), 'export const increment = value => value; export const reset = () => 0;\n');
    await assert.rejects(verifyFounderImplementation(item.directory), error => error.code === 'VERIFICATION_FAILED');
  } finally { await item.cleanup(); }
});

test('verification does not pass credential environment to generated checks', async () => {
  const item = await fixture();
  try {
    process.env.WHATLOOM_FIXTURE_SECRET = 'never pass this';
    await verifyFounderImplementation(item.directory, { execute: async (_program, _args, options) => {
      assert.equal(options.env.WHATLOOM_FIXTURE_SECRET, undefined); assert.equal(options.env.GH_TOKEN, undefined); assert.equal(options.env.NODE_OPTIONS, undefined); assert.notEqual(options.env.HOME, process.env.HOME); assert.equal(options.cwd, await import('node:fs/promises').then(fs => fs.realpath(item.directory)));
      return { stdout: 'ok', stderr: '', exitCode: 0 };
    } });
  } finally { delete process.env.WHATLOOM_FIXTURE_SECRET; await item.cleanup(); }
});

test('a completion claim, docs only, or missing readable evidence cannot unlock publication', async () => {
  const item = await fixture();
  try {
    await rm(join(item.directory, 'TESTING.md')); await assert.rejects(verifyFounderImplementation(item.directory), error => error.code === 'VERIFICATION_REQUIRED');
    await writeFile(join(item.directory, 'TESTING.md'), 'Completed testing. '.repeat(10)); await rm(join(item.directory, 'counter.mjs'));
    await assert.rejects(verifyFounderImplementation(item.directory), error => error.code === 'NO_IMPLEMENTATION');
  } finally { await item.cleanup(); }
});

test('verification rejects changing source, source credentials, links, and submodules', async () => {
  const item = await fixture();
  try {
    await assert.rejects(verifyFounderImplementation(item.directory, { execute: async () => { await writeFile(join(item.directory, 'new.mjs'), 'export const changed = true;'); return { stdout: '', stderr: '', exitCode: 0 }; } }), error => error.code === 'BUILD_CHANGED_DURING_VERIFICATION');
    await writeFile(join(item.directory, 'leak.txt'), `token: ghp_${'a'.repeat(36)}`);
    await assert.rejects(verifyFounderImplementation(item.directory), error => error.code === 'SECRET_IN_BUILD'); await rm(join(item.directory, 'leak.txt'));
    await symlink('/tmp', join(item.directory, 'external'));
    await assert.rejects(verifyFounderImplementation(item.directory), error => error.code === 'UNSAFE_BUILD_FILE'); await rm(join(item.directory, 'external'));
    await writeFile(join(item.directory, '.gitmodules'), '[submodule "external"]');
    await assert.rejects(verifyFounderImplementation(item.directory), error => error.code === 'UNSAFE_BUILD_FILE');
  } finally { await item.cleanup(); }
});

test('publisher creates a private repo, commits screened source, and pushes only to its recorded new remote', async () => {
  const item = await fixture(); const publisher = await publisherFixture(item);
  try {
    await writeFile(join(item.directory, '.env'), 'GH_TOKEN=private'); await writeFile(join(item.directory, '.env.example'), 'API_KEY=YOUR_KEY_HERE\n'); await writeFile(join(item.directory, 'PRODUCT-BRIEF.md'), 'Private plan'); await writeFile(join(item.directory, 'WHATLOOM-BUILD.md'), 'Private history');
    await writeFile(join(item.directory, '.whatloom/project.json'), '{"private":"conversation"}');
    await mkdir(join(item.directory, 'node_modules')); await writeFile(join(item.directory, 'node_modules/dependency.js'), 'Do not commit');
    await mkdir(join(item.directory, 'data')); await writeFile(join(item.directory, 'data/customer-import.csv'), 'name,email\nPrivate Customer,private@example.test\n');
    await writeFile(join(item.directory, '.gitignore'), 'data/customer-import.csv\n');
    await mkdir(join(item.directory, '.git/hooks'), { recursive: true }); await writeFile(join(item.directory, '.git/hooks/pre-commit'), '#!/bin/sh\nexit 99\n', { mode: 0o755 });
    const verification = await verifyFounderImplementation(item.directory);
    const published = await publishFounderImplementation(item.directory, target, { ...publisher.options, verification });
    assert.equal(published.visibility, 'private'); assert.equal(publisher.creates, 1); assert.match(published.commit, /^[a-f0-9]{40}$/);
    const contents = await realGit(['ls-tree', '--name-only', '-r', 'main'], publisher.remote);
    assert.match(contents.stdout, /counter.mjs/); assert.match(contents.stdout, /TESTING.md/); assert.match(contents.stdout, /\.env.example/); assert.doesNotMatch(contents.stdout, /whatloom|BRIEF|WHATLOOM|node_modules|customer-import|^\.env$|\.git\//m);
    const [state] = await readdir(publisher.options.stateRoot);
    const receipt = JSON.parse(await readFile(join(publisher.options.stateRoot, state, 'receipt.json'), 'utf8'));
    assert.equal(receipt.version, 2); assert.match(receipt.snapshotDigest, /^[a-f0-9]{64}$/); assert.notEqual(receipt.snapshotDigest, receipt.digest);
    const resumed = await publishFounderImplementation(item.directory, target, { ...publisher.options, verification });
    assert.deepEqual(resumed, published); assert.equal(publisher.creates, 1); assert.equal(publisher.calls.filter(call => call.tool === 'git' && call.args[0] === 'push').length, 1);
  } finally { await item.cleanup(); }
});

test('ignoring implementation or testing evidence cannot produce a docs-only published repository', async () => {
  for (const ignored of ['counter.mjs', 'TESTING.md']) {
    const item = await fixture(); const publisher = await publisherFixture(item);
    try {
      await writeFile(join(item.directory, '.gitignore'), `${ignored}\n`);
      const verification = await verifyFounderImplementation(item.directory);
      await assert.rejects(publishFounderImplementation(item.directory, target, { ...publisher.options, verification }), error => error.code === 'PUBLICATION_FILES_IGNORED');
      assert.equal(publisher.creates, 0);
    } finally { await item.cleanup(); }
  }
});

test('Git attribute transformations cannot publish bytes different from the verified implementation', async () => {
  const item = await fixture(); const publisher = await publisherFixture(item);
  try {
    await writeFile(join(item.directory, 'counter.mjs'), 'export const increment = value => value + 1;\r\nexport const reset = () => 0;\r\n');
    await writeFile(join(item.directory, '.gitattributes'), 'counter.mjs text eol=lf\n');
    const verification = await verifyFounderImplementation(item.directory);
    await assert.rejects(publishFounderImplementation(item.directory, target, { ...publisher.options, verification }), error => error.code === 'PUBLICATION_SNAPSHOT_CHANGED');
    assert.equal(publisher.creates, 0);
  } finally { await item.cleanup(); }
});

test('failed check logs redact JSON credentials as well as plain assignments', async () => {
  const item = await fixture();
  try {
    const logs = [];
    await assert.rejects(verifyFounderImplementation(item.directory, { onLog: value => logs.push(value), execute: async () => ({ exitCode: 1, stdout: '{"access_token":"opaque-private-value","password":"private-password"}\napi_key=private-api-value', stderr: '' }) }), error => error.code === 'VERIFICATION_FAILED');
    assert.ok(logs.join('\n').includes('[redacted]'));
    assert.doesNotMatch(logs.join('\n'), /opaque-private-value|private-password|private-api-value/);
  } finally { await item.cleanup(); }
});

test('unqualified Not Found output cannot authorize repository creation', async () => {
  const item = await fixture(); const publisher = await publisherFixture(item);
  try {
    const verification = await verifyFounderImplementation(item.directory);
    await assert.rejects(publishFounderImplementation(item.directory, target, { ...publisher.options, verification, github: async () => ({ exitCode: 1, stdout: '', stderr: 'Proxy configuration Not Found' }) }), error => error.code === 'GITHUB_LOOKUP_FAILED');
    assert.equal(publisher.creates, 0);
  } finally { await item.cleanup(); }
});

test('publisher refuses changed source and repositories it did not create', async () => {
  const item = await fixture(); const publisher = await publisherFixture(item);
  try {
    const verification = await verifyFounderImplementation(item.directory);
    await writeFile(join(item.directory, 'extra.mjs'), 'export const changed = true;');
    await assert.rejects(publishFounderImplementation(item.directory, target, { ...publisher.options, verification }), error => error.code === 'BUILD_CHANGED_AFTER_VERIFICATION'); assert.equal(publisher.creates, 0);
    await rm(join(item.directory, 'extra.mjs'));
    publisher.repository = { id: 456, full_name: `${target.owner}/${target.repository}`, private: true };
    await assert.rejects(publishFounderImplementation(item.directory, target, { ...publisher.options, verification }), error => error.code === 'GITHUB_REPOSITORY_EXISTS'); assert.equal(publisher.creates, 0);
  } finally { await item.cleanup(); }
});

test('failed push resumes only the app-created repo, while changed remote identity stops retry', async () => {
  const item = await fixture(); const publisher = await publisherFixture(item);
  try {
    const verification = await verifyFounderImplementation(item.directory); publisher.failPush = true;
    await assert.rejects(publishFounderImplementation(item.directory, target, { ...publisher.options, verification }), error => error.code === 'GITHUB_PUSH_FAILED'); assert.equal(publisher.creates, 1);
    publisher.repository = { id: 9999, full_name: `${target.owner}/${target.repository}`, private: true }; publisher.failPush = false;
    await assert.rejects(publishFounderImplementation(item.directory, target, { ...publisher.options, verification }), error => error.code === 'GITHUB_REPOSITORY_CHANGED');
    publisher.repository = { id: 9321, full_name: `${target.owner}/${target.repository}`, private: true };
    const result = await publishFounderImplementation(item.directory, target, { ...publisher.options, verification });
    assert.match(result.url, /fixture-labs\/clear-counter$/); assert.equal(publisher.creates, 1);
  } finally { await item.cleanup(); }
});

test('ambiguous creation cannot adopt an existing repository on retry', async () => {
  const item = await fixture(); const publisher = await publisherFixture(item);
  try {
    const verification = await verifyFounderImplementation(item.directory); publisher.unknownCreate = true;
    await assert.rejects(publishFounderImplementation(item.directory, target, { ...publisher.options, verification }), error => error.code === 'GITHUB_CREATE_FAILED');
    publisher.unknownCreate = false;
    await assert.rejects(publishFounderImplementation(item.directory, target, { ...publisher.options, verification }), error => error.code === 'GITHUB_CREATE_UNCERTAIN'); assert.equal(publisher.creates, 1);
  } finally { await item.cleanup(); }
});

test('a successful push exit code without the remote commit is not reported as published', async () => {
  const item = await fixture(); const publisher = await publisherFixture(item);
  try {
    const verification = await verifyFounderImplementation(item.directory); publisher.pretendPush = true;
    await assert.rejects(publishFounderImplementation(item.directory, target, { ...publisher.options, verification }), error => error.code === 'GITHUB_PUSH_UNCONFIRMED');
    publisher.pretendPush = false;
    const result = await publishFounderImplementation(item.directory, target, { ...publisher.options, verification });
    assert.match(result.commit, /^[a-f0-9]{40}$/); assert.equal(publisher.creates, 1);
  } finally { await item.cleanup(); }
});

test('GitHub scope, SSO, and policy failures explain recovery without exposing raw credentials', async () => {
  const item = await fixture(); const publisher = await publisherFixture(item);
  try {
    const verification = await verifyFounderImplementation(item.directory); publisher.failPush = true;
    for (const [message, code, guidance] of [
      ['refusing to create workflow without workflow scope', 'GITHUB_SCOPE_REQUIRED', /Reconnect GitHub/],
      ['organization requires SAML SSO authorization', 'GITHUB_SSO_REQUIRED', /single sign-on/],
      ['GH013: repository rule violations found', 'GITHUB_POLICY_REQUIRED', /repository policy/],
    ]) {
      publisher.pushMessage = `${message} token=should-never-be-displayed`;
      await assert.rejects(publishFounderImplementation(item.directory, target, { ...publisher.options, verification }), error => error.code === code && guidance.test(error.message) && /Retry tests & publish/.test(error.message) && !error.message.includes('should-never-be-displayed'));
    }
    assert.equal(publisher.creates, 1);
  } finally { await item.cleanup(); }
});

test('repeated checks may write ignored build and browser-test output without changing source digest', async () => {
  const item = await fixture();
  try {
    const result = await verifyFounderImplementation(item.directory, { execute: async (_program, _args, options) => {
      assert.equal(options.env.NODE_ENV, 'test');
      await mkdir(join(item.directory, 'playwright-report')); await writeFile(join(item.directory, 'playwright-report/index.html'), 'generated report');
      await writeFile(join(item.directory, 'tsconfig.tsbuildinfo'), 'generated cache');
      return { stdout: '', stderr: '', exitCode: 0 };
    } });
    assert.equal(result.fileCount, 3);
  } finally { await item.cleanup(); }
});

test('publication provenance is kept outside generated source and is not derived from workspace JSON', async () => {
  const item = await fixture(); const publisher = await publisherFixture(item);
  try {
    await writeFile(join(item.directory, '.whatloom/publication.json'), JSON.stringify({ phase: 'created', remoteId: 'evil' }));
    const verification = await verifyFounderImplementation(item.directory);
    await publishFounderImplementation(item.directory, target, { ...publisher.options, verification });
    const states = await readdir(publisher.options.stateRoot); assert.equal(states.length, 1);
    const receipt = JSON.parse(await readFile(join(publisher.options.stateRoot, states[0], 'receipt.json'), 'utf8'));
    assert.equal(receipt.phase, 'published'); assert.equal(receipt.remoteId, '9321'); assert.equal(receipt.digest, verification.filesDigest);
  } finally { await item.cleanup(); }
});
