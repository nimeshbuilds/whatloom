import assert from 'node:assert/strict';
import { mkdtemp, chmod, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { AgentError, apiError, buildAgentArgs, exploreInputSchema, modelSchema, normalizeSelectedModel, runAgent } from '../lib/agent-server.ts';
import {
  authActionSchema, createAgentConnectionService, extractAuthUrl, parseAuthStatus,
  parseCodexModels, readCodexModels, safeAuthUrl,
} from '../lib/agent-connection.ts';

const loggedOut = { stdout: '', stderr: 'Not logged in', exitCode: 1 };
const loggedIn = { stdout: '', stderr: 'Logged in using ChatGPT', exitCode: 0 };
const browserUrl = 'https://auth.openai.com/oauth/authorize?client_id=official-client&state=temporary-state&code_challenge=pkce';
const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

test('connection status exposes no account identifiers, tokens, or raw CLI output', () => {
  const claude = parseAuthStatus('claude', { exitCode: 0, stderr: 'secret-stderr', stdout: JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', email: 'private@example.org', accessToken: 'secret-token', configDirectory: '/private/home' }) });
  assert.equal(claude.status, 'connected');
  assert.equal(claude.authMethod, 'claude.ai');
  assert.ok(!JSON.stringify(claude).includes('private'));
  assert.ok(!JSON.stringify(claude).includes('secret'));
  assert.equal(parseAuthStatus('claude', { exitCode: 1, stderr: '', stdout: '{"loggedIn":false,"authMethod":"none"}' }).status, 'disconnected');
  assert.equal(parseAuthStatus('claude', { ...loggedIn, stdout: 'not JSON secret-token' }).status, 'error');
  assert.equal(parseAuthStatus('codex', loggedIn).authMethod, 'chatgpt');
  assert.equal(parseAuthStatus('codex', loggedOut).status, 'disconnected');
  assert.equal(parseAuthStatus('codex', { ...loggedOut, exitCode: 7 }).status, 'error');
});

test('safe agent errors retain their HTTP status across separate Next module identities', async () => {
  const otherBundle = await import('../lib/agent-server.ts?fixture-other-route');
  const error = new otherBundle.AgentError('LOGIN_NOT_FOUND', 'This login is no longer active.', 409);
  assert.equal(error instanceof AgentError, false);
  const response = apiError(error);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'LOGIN_NOT_FOUND');
  assert.equal(apiError({ code: 'AUTH_REQUIRED', status: 401, message: 'Untrusted raw contents' }).status, 502);
});

test('browser login URLs require exact provider authorization hosts and reject credentials', () => {
  assert.equal(safeAuthUrl('codex', browserUrl), browserUrl);
  assert.ok(safeAuthUrl('claude', 'https://claude.ai/oauth/authorize?client_id=official&state=one-time'));
  assert.ok(safeAuthUrl('claude', 'https://claude.ai/oauth/authorize?code=true&client_id=official'));
  assert.equal(safeAuthUrl('claude', 'https://claude.ai/oauth/authorize?code=secret'), undefined);
  assert.equal(safeAuthUrl('claude', 'https://claude.ai/oauth/authorize?code=true&code=secret'), undefined);
  assert.ok(safeAuthUrl('codex', browserUrl + '&redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback'));
  for (const url of [
    'http://auth.openai.com/oauth/authorize', 'https://auth.openai.com.attacker.example/oauth/authorize',
    'https://auth.openai.com:444/oauth/authorize', 'https://auth.openai.com/elsewhere',
    'https://password@auth.openai.com/oauth/authorize', 'https://auth.openai.com/oauth/authorize#access_token=secret',
    'https://auth.openai.com/oauth/authorize?access_token=secret', 'https://auth.openai.com/oauth/authorize?code=secret',
    'https://auth.openai.com/oauth/authorize?unknown_secret=secret',
    'https://auth.openai.com/oauth/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback%3Faccess_token%3Dsecret',
    'https://claude.ai/oauth/authorize', 'https://localhost/oauth/authorize', 'file:///private/auth.json',
  ]) assert.equal(safeAuthUrl('codex', url), undefined, url);
  assert.equal(extractAuthUrl('codex', `Ignored https://evil.example/\n\u001b[32mOpen ${browserUrl}\u001b[0m\n`), browserUrl);
  assert.equal(extractAuthUrl('claude', browserUrl), undefined);
});

test('selected model is bounded data and reaches both existing CLI adapters', () => {
  assert.equal(exploreInputSchema.parse({ provider: 'codex', model: 'gpt-6-astra', vision: 'Make useful new capabilities.', context: '', domain: '', constraints: [] }).model, 'gpt-6-astra');
  for (const provider of ['codex', 'claude']) {
    const args = buildAgentArgs(provider, {}, '/tmp/schema.json', false, 'chosen-model');
    assert.equal(args[args.indexOf('--model') + 1], 'chosen-model');
    assert.ok(!buildAgentArgs(provider, {}, '/tmp/schema.json', false, 'default').includes('--model'));
  }
  assert.equal(normalizeSelectedModel('claude', 'default'), undefined);
  for (const value of ['--dangerous', 'model\n--tools', '$(secret)', 'x'.repeat(121)]) assert.equal(modelSchema.safeParse(value).success, false);
});

test('auth input requires a specific cancellable attempt and rejects extra commands', () => {
  assert.equal(authActionSchema.safeParse({ provider: 'codex', action: 'start' }).success, true);
  assert.equal(authActionSchema.safeParse({ provider: 'claude', action: 'cancel' }).success, false);
  assert.equal(authActionSchema.safeParse({ provider: 'codex', action: 'start', executable: '/bin/sh' }).success, false);
  assert.equal(authActionSchema.safeParse({ provider: 'codex', action: 'logout' }).success, false);
});

test('login starts one official process, captures only an allowed URL, and cancellation aborts that attempt', async () => {
  let loginCalls = 0;
  let capturedOptions;
  let capturedArgs;
  const service = createAgentConnectionService({
    discover: async () => '/fixture/codex',
    run: async (_path, args, options) => {
      if (args.includes('status')) return loggedOut;
      loginCalls += 1; capturedOptions = options; capturedArgs = args;
      options.onOutput('https://attacker.example/secret\n');
      options.onOutput(browserUrl.slice(0, 40)); options.onOutput(browserUrl.slice(40) + '\n');
      return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new AgentError('CANCELLED', 'cancelled')), { once: true }));
    },
  });
  const [first, duplicate] = await Promise.all([service.start('codex'), service.start('codex')]);
  assert.equal(loginCalls, 1);
  assert.equal(first.attempt.id, duplicate.attempt.id);
  assert.deepEqual(capturedArgs, ['login']);
  assert.equal((await service.status('codex')).attempt.url, browserUrl);
  await assert.rejects(service.cancel('codex', 'wrong-attempt'), (error) => error.code === 'LOGIN_NOT_FOUND');
  const cancelled = await service.cancel('codex', first.attempt.id);
  assert.equal(capturedOptions.signal.aborted, true);
  assert.equal(cancelled.attempt.status, 'cancelled');
  assert.equal(cancelled.attempt.url, undefined);
});

test('successful login is accepted only after an actual status check and removes the auth URL', async () => {
  let connected = false;
  let complete;
  const service = createAgentConnectionService({
    discover: async () => '/fixture/codex',
    run: async (_path, args, options) => {
      if (args.includes('status')) return connected ? loggedIn : loggedOut;
      options.onOutput(browserUrl);
      return new Promise((resolve) => { complete = resolve; });
    },
  });
  assert.equal((await service.start('codex')).status, 'pending');
  connected = true; complete({ exitCode: 0, stdout: 'sensitive CLI data', stderr: '' });
  await nextTurn();
  const result = await service.status('codex');
  assert.equal(result.status, 'connected');
  assert.equal(result.attempt.status, 'connected');
  assert.equal(result.attempt.url, undefined);
  assert.ok(!JSON.stringify(result).includes('sensitive'));
  assert.equal((await service.start('codex')).status, 'connected');
});

test('login exit success without verified authentication fails honestly; timeout expires', async () => {
  for (const failure of ['unverified', 'timeout']) {
    const service = createAgentConnectionService({
      discover: async () => '/fixture/claude',
      run: async (_path, args) => {
        if (args.includes('status')) return { stdout: '{"loggedIn":false}', stderr: '', exitCode: 1 };
        assert.deepEqual(args, ['auth', 'login', '--claudeai']);
        if (failure === 'timeout') throw new AgentError('TIMEOUT', 'raw secret timeout');
        return { stdout: '', stderr: '', exitCode: 0 };
      },
    });
    await service.start('claude'); await nextTurn();
    const result = await service.status('claude');
    assert.equal(result.attempt.status, failure === 'timeout' ? 'expired' : 'error');
    assert.ok(!JSON.stringify(result).includes('secret'));
  }
});

test('missing CLIs never start login; Claude catalog explicitly labels documented aliases', async () => {
  const missing = createAgentConnectionService({ discover: async () => null, run: async () => { throw Error('must not run'); } });
  assert.equal((await missing.start('codex')).status, 'unavailable');
  await assert.rejects(missing.models('codex'), (error) => error.code === 'AGENT_NOT_INSTALLED');
  const service = createAgentConnectionService({ discover: async () => '/fixture/claude' });
  const models = await service.models('claude');
  assert.equal(models.source, 'documented');
  assert.deepEqual(models.models.map((item) => item.id), ['default', 'sonnet', 'opus', 'haiku']);
  assert.match(models.detail, /Availability depends on your account/);
});

test('model catalog filters hidden, unsafe, and duplicate entries without treating a catalog as entitlement', () => {
  assert.deepEqual(parseCodexModels({ data: [
    { id: 'catalog-id', model: 'real-model', displayName: 'Model', isDefault: true },
    { model: 'real-model' }, { model: '--unsafe' }, { model: 'hidden-model', hidden: true },
  ] }), [{ id: 'real-model', name: 'Model', isDefault: true }]);
  assert.throws(() => parseCodexModels({ data: [] }), (error) => error.code === 'MODELS_UNAVAILABLE');
});

test('Codex catalog performs the real initialization handshake with no inference methods', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'whatloom-catalog-test-'));
  try {
    const executable = join(directory, 'codex');
    await writeFile(executable, `#!${process.execPath}\nconst rl=require('node:readline').createInterface({input:process.stdin});let initialized=false;rl.on('line',line=>{const m=JSON.parse(line);if(m.method==='initialize'){process.stdout.write(JSON.stringify({id:m.id,result:{userAgent:'fixture'}})+'\\n');}else if(m.method==='initialized'){initialized=true;}else if(m.method==='model/list'&&initialized){process.stderr.write('private diagnostic never returned');process.stdout.write(JSON.stringify({id:m.id,result:{data:[{model:'fixture-model',displayName:'Fixture model',isDefault:true}],nextCursor:null}})+'\\n');}else{process.exit(8)}});`);
    await chmod(executable, 0o700);
    assert.deepEqual(await readCodexModels(executable, 3000), [{ id: 'fixture-model', name: 'Fixture model', isDefault: true }]);
    await writeFile(executable, `#!${process.execPath}\nprocess.stdin.resume();setInterval(()=>{},1000);`);
    await assert.rejects(readCodexModels(executable, 60), (error) => error.code === 'MODELS_UNAVAILABLE' && error.status === 504);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('exported agent runner sends the selected model to an isolated fixture CLI', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'whatloom-model-runner-test-'));
  const previousPath = process.env.PATH;
  try {
    const executable = join(directory, 'codex');
    await writeFile(executable, `#!${process.execPath}\nlet input='';process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',()=>{const args=process.argv.slice(2);const payload={model:args[args.indexOf('--model')+1],brief:input,isolated:process.cwd()!==${JSON.stringify(directory)}};console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(payload)}}));});`);
    await chmod(executable, 0o700);
    process.env.PATH = directory;
    const result = await runAgent('codex', { type: 'object' }, 'A public fixture brief.', undefined, false, 'fixture-model');
    assert.deepEqual(result.payload, { model: 'fixture-model', brief: 'A public fixture brief.', isolated: true });
  } finally {
    if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath;
    await rm(directory, { recursive: true, force: true });
  }
});
