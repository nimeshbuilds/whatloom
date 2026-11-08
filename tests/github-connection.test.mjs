import assert from 'node:assert/strict';
import test from 'node:test';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentError } from '../lib/agent-server.ts';
import { createGitHubConnectionService, githubActionSchema, githubProcessEnvironment, parseGitHubAccounts, parseGitHubDevicePrompt, redactGitHubOutput } from '../lib/github-connection.ts';

const result = (value, exitCode = 0) => ({ stdout: typeof value === 'string' ? value : JSON.stringify(value), stderr: '', exitCode });
const tick = () => new Promise((resolve) => setImmediate(resolve));
function fixture(overrides = {}) {
  const calls = [];
  let active = 'alice';
  const service = createGitHubConnectionService({
    discover: async (name = 'gh') => `/fixture/${name}`,
    execute: async (executable, args, options = {}) => {
      calls.push({ executable, args, options });
      const response = await overrides.execute?.(executable, args, options);
      if (response !== undefined) return response;
      if (args[0] === 'auth' && args[1] === 'status') return result({ hosts: { 'github.com': ['alice', 'bob'].map((login) => ({ login, state: 'success', active: active === login, token: 'never-expose' })) } });
      if (args[0] === 'auth' && args[1] === 'token') return result(`fixture-secret-${args.at(-1)}`);
      if (args[0] === 'auth' && args[1] === 'switch') { active = args.at(-1); return result(''); }
      if (args.includes('user') && args.includes('.login')) return result(options.token?.endsWith('bob') ? 'bob' : 'alice');
      if (args.includes('user') && args.includes('{login,name}')) return result({ login: options.token?.endsWith('bob') ? 'bob' : 'alice', name: 'Display name' });
      if (args.includes('user/orgs?per_page=100')) return result([[{ login: 'studio-one', token: 'hidden' }], [{ login: 'studio-two' }, { login: 'studio-one' }]]);
      if (args.some((item) => item.startsWith('user/memberships/orgs/'))) return result({ state: 'active', organization: { login: args.at(-1).split('/').at(-1) } });
      throw new Error(`Unexpected fixture command: ${args.join(' ')}`);
    }, ...overrides.dependencies,
  });
  return { service, calls, setActive: (value) => { active = value; } };
}

test('status returns only connected account identities and sanitized personal/org destinations', async () => {
  const { service } = fixture();
  const value = await service.status();
  assert.equal(value.status, 'connected');
  assert.deepEqual(value.account, { login: 'alice', name: 'Display name' });
  assert.deepEqual(value.accounts, [{ login: 'alice', active: true }, { login: 'bob', active: false }]);
  assert.deepEqual(value.owners.map((owner) => [owner.login, owner.type]), [['alice', 'User'], ['studio-one', 'Organization'], ['studio-two', 'Organization']]);
  assert.ok(!JSON.stringify(value).includes('secret'));
  assert.ok(!JSON.stringify(value).includes('token'));
});

test('account parsing ignores other hosts, failed accounts, paths, and credential fields', () => {
  assert.deepEqual(parseGitHubAccounts(result({ hosts: { 'github.com': [
    { login: 'alice', state: 'success', active: true, token: 'secret' },
    { login: 'expired', state: 'failure', active: false }, { login: '../private', state: 'success' },
  ], 'evil.example': [{ login: 'foreign', state: 'success', active: true }] } })), [{ login: 'alice', active: true }]);
  assert.throws(() => parseGitHubAccounts(result('bad json secret')), (error) => error.code === 'GITHUB_STATUS_FAILED' && !error.message.includes('secret'));
});

test('device-code UI accepts only the official device URL and specifically labeled one-time codes', () => {
  assert.deepEqual(parseGitHubDevicePrompt('! First copy your one-time code: ABCD-EF12\nOpen https://github.com/login/device in your browser'), { url: 'https://github.com/login/device', code: 'ABCD-EF12' });
  for (const text of ['https://github.com.attacker.example/login/device', 'https://github.com/login/device?token=secret', 'https://github.com/login/device/secret', 'https://github.com/login/device#secret', 'Token: ABCD-EFGH']) assert.deepEqual(parseGitHubDevicePrompt(text), {}, text);
});

test('action schema does not permit tokens, logout, commands, or unbound cancellation', () => {
  assert.equal(githubActionSchema.safeParse({ action: 'login' }).success, true);
  assert.equal(githubActionSchema.safeParse({ action: 'select-account', account: 'alice' }).success, true);
  for (const input of [{ action: 'login', token: 'secret' }, { action: 'logout' }, { action: 'cancel' }, { action: 'select-account', account: '--unsafe' }]) assert.equal(githubActionSchema.safeParse(input).success, false);
});

test('read operations distinguish unavailable, disconnected, and failed GitHub connections', async () => {
  assert.equal((await createGitHubConnectionService({ discover: async () => null }).status()).status, 'unavailable');
  const missing = fixture({ execute: async (_exec, args) => args[1] === 'status' ? result({ hosts: { 'github.com': [] } }) : undefined });
  assert.equal((await missing.service.status()).status, 'disconnected');
  const failed = fixture({ execute: async () => { throw new Error('private credential details'); } });
  const value = await failed.service.status();
  assert.equal(value.status, 'error'); assert.ok(!JSON.stringify(value).includes('private'));
});

test('organization load failure keeps the personal account usable with a clear explanation', async () => {
  const { service } = fixture({ execute: async (_exec, args) => args.includes('user/orgs?per_page=100') ? result('permission denied', 1) : undefined });
  const value = await service.status();
  assert.equal(value.status, 'connected'); assert.equal(value.owners.length, 1); assert.match(value.detail, /organizations could not be loaded/);
});

test('another account can connect; duplicate clicks share one process and cancellation targets only that attempt', async () => {
  let loginOptions;
  const { service, calls } = fixture({ execute: async (_exec, args, options) => {
    if (args[0] !== 'auth' || args[1] !== 'login') return;
    loginOptions = options;
    options.onOutput('First copy your one-time code: ABCD-'); options.onOutput('EFGH\nhttps://github.com/login/device\n');
    return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new AgentError('CANCELLED', 'cancelled')), { once: true }));
  } });
  assert.equal((await service.status()).status, 'connected');
  const [first, duplicate] = await Promise.all([service.login(), service.login()]);
  assert.equal(first.attempt.id, duplicate.attempt.id);
  assert.equal(calls.filter(({ args }) => args[1] === 'login').length, 1);
  assert.equal(first.attempt.code, 'ABCD-EFGH');
  assert.deepEqual(calls.find(({ args }) => args[1] === 'login').args, ['auth', 'login', '--hostname', 'github.com', '--git-protocol', 'https', '--web', '--clipboard=false', '--scopes', 'repo,read:org,workflow', '--skip-ssh-key']);
  await assert.rejects(service.cancel('wrong-id'), (error) => error.code === 'GITHUB_LOGIN_NOT_FOUND');
  await assert.rejects(service.selectAccount('bob'), (error) => error.code === 'GITHUB_BUSY');
  const cancelled = await service.cancel(first.attempt.id);
  assert.equal(loginOptions.signal.aborted, true); assert.equal(cancelled.attempt.status, 'cancelled');
  assert.equal(cancelled.attempt.code, undefined); assert.equal(cancelled.attempt.url, undefined); assert.equal(cancelled.account.login, 'alice');
});

test('successful login is independently verified and temporary device data is removed', async () => {
  let complete;
  const { service } = fixture({ execute: async (_exec, args, options) => {
    if (args[1] === 'login') { options.onOutput('one-time code: ABCD-EFGH\nhttps://github.com/login/device'); return new Promise((resolve) => { complete = resolve; }); }
  } });
  await service.login(); complete(result('secret login output')); await tick();
  const value = await service.status();
  assert.equal(value.attempt.status, 'connected'); assert.equal(value.attempt.code, undefined); assert.equal(value.attempt.url, undefined);
  assert.ok(!JSON.stringify(value).includes('secret'));
});

test('unverified login success and timeout cannot be presented as a new connection', async () => {
  for (const timeout of [false, true]) {
    const { service } = fixture({ execute: async (_exec, args) => {
      if (args[1] === 'login') { if (timeout) throw new AgentError('GITHUB_TIMEOUT', 'private details'); return result(''); }
      if (args[1] === 'status') return result({ hosts: {} });
    } });
    await service.login(); await tick();
    const value = await service.status();
    assert.equal(value.attempt.status, timeout ? 'expired' : 'error'); assert.ok(!JSON.stringify(value).includes('private'));
  }
});

test('account selection is explicit, allows only stored accounts, and reloads their destinations', async () => {
  const { service, calls } = fixture();
  await assert.rejects(service.selectAccount('stranger'), (error) => error.code === 'GITHUB_ACCOUNT_NOT_FOUND');
  assert.equal((await service.selectAccount('bob')).account.login, 'bob');
  assert.equal((await service.status()).owners[0].login, 'bob');
  assert.deepEqual(calls.filter(({ args }) => args[1] === 'switch').map(({ args }) => args), [['auth', 'switch', '--hostname', 'github.com', '--user', 'bob']]);
});

test('publishing pins a selected account even if another account is active and redacts command output', async () => {
  const { service, calls, setActive } = fixture({ execute: async (_exec, args, options) => args[0] === 'repo' ? result(`Created repo with ${options.token}; ghp_do_not_return`) : undefined });
  setActive('bob');
  const value = await service.run(['repo', 'view', 'alice/product'], '/project', undefined, 'alice');
  assert.match(value.stdout, /\[redacted\]/); assert.ok(!value.stdout.includes('secret')); assert.ok(!value.stdout.includes('ghp_'));
  assert.equal(calls.find(({ args }) => args[0] === 'repo').options.token, 'fixture-secret-alice');
  assert.equal(calls.filter(({ args }) => args[1] === 'switch').length, 0);
  await assert.rejects(service.run(['auth', 'token']), (error) => error.code === 'GITHUB_COMMAND_DENIED');
});

test('credential mismatch stops the remote operation before any repository mutation', async () => {
  const { service, calls } = fixture({ execute: async (_exec, args) => args.includes('.login') ? result('mallory') : undefined });
  await assert.rejects(service.run(['repo', 'create', 'alice/product'], '/project', undefined, 'alice'), (error) => error.code === 'GITHUB_ACCOUNT_CHANGED');
  assert.equal(calls.some(({ args }) => args[0] === 'repo'), false);
});

test('destination validation requires active membership, with personal and org identities bound to the selected account', async () => {
  const { service } = fixture();
  assert.deepEqual(await service.assertOwner('alice', 'alice'), { account: { login: 'alice' }, owner: { login: 'alice', type: 'User' } });
  assert.equal((await service.assertOwner('studio-one', 'alice')).owner.type, 'Organization');
  const denied = fixture({ execute: async (_exec, args) => args.some((arg) => arg.startsWith('user/memberships/')) ? result({ state: 'pending', organization: { login: 'studio-one' } }) : undefined });
  await assert.rejects(denied.service.assertOwner('studio-one', 'alice'), (error) => error.code === 'GITHUB_OWNER_UNAVAILABLE');
});

test('repository preflight permits only verified 404, never an existing repo or network/auth failure', async () => {
  for (const [response, code] of [[result('HTTP/2.0 404 Not Found\r\n', 1), null], [result('HTTP/2.0 200 OK\r\n'), 'GITHUB_REPOSITORY_EXISTS'], [result('HTTP/2.0 403 Forbidden\r\n', 1), 'GITHUB_REPOSITORY_CHECK_FAILED'], [result('connection failed', 1), 'GITHUB_REPOSITORY_CHECK_FAILED']]) {
    const { service } = fixture({ execute: async (_exec, args) => args.includes('--include') ? response : undefined });
    if (code) await assert.rejects(service.assertNewRepository('alice', 'new-product', 'alice'), (error) => error.code === code);
    else await service.assertNewRepository('alice', 'new-product', 'alice');
  }
});

test('remote Git uses account credentials with isolated config and disabled hooks', async () => {
  const { service, calls } = fixture({ execute: async (exec, _args, options) => exec === '/fixture/git' ? result(`Pushed ${options.token}`) : undefined });
  const value = await service.git(['push', 'https://github.com/alice/product.git', 'HEAD:refs/heads/main'], '/project', undefined, 'alice');
  assert.equal(value.stdout, 'Pushed [redacted]');
  const command = calls.find(({ executable }) => executable === '/fixture/git');
  assert.equal(command.options.git, true); assert.equal(command.options.token, 'fixture-secret-alice');
  assert.ok(command.args.includes('core.hooksPath=/dev/null')); assert.ok(command.args.includes('core.fsmonitor=false'));
  assert.ok(command.args.includes("credential.https://github.com.helper=!'/fixture/gh' auth git-credential"));
  await assert.rejects(service.git(['push'], '/project'), (error) => error.code === 'GITHUB_ACCOUNT_REQUIRED');
  await assert.rejects(service.git(['config', '--global'], '/project', undefined, 'alice'), (error) => error.code === 'GITHUB_COMMAND_DENIED');
});

test('child environments remove inherited identity, tracing, and Git overrides without leaking credentials', () => {
  const keys = ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_DEBUG', 'GH_HOST', 'GIT_CONFIG_COUNT', 'GIT_DIR'];
  const old = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    for (const key of keys) process.env[key] = 'unwanted';
    const env = githubProcessEnvironment('selected-token', true);
    assert.equal(env.GH_TOKEN, 'selected-token'); assert.equal(env.GITHUB_TOKEN, undefined); assert.equal(env.GH_DEBUG, undefined);
    assert.equal(env.GH_HOST, 'github.com'); assert.equal(env.GIT_DIR, undefined); assert.equal(env.GIT_CONFIG_COUNT, undefined);
    assert.equal(env.GIT_CONFIG_GLOBAL, '/dev/null'); assert.equal(env.GIT_CONFIG_NOSYSTEM, '1'); assert.equal(env.GIT_TERMINAL_PROMPT, '0');
    assert.equal(redactGitHubOutput('Authorization: Bearer hidden\ngithub_pat_private\nghp_private'), 'Authorization: Bearer [redacted]\n[redacted]\n[redacted]');
  } finally { for (const key of keys) if (old[key] === undefined) delete process.env[key]; else process.env[key] = old[key]; }
});

test('real child process credentials stay internal and cancellation stops only the owned fixture process', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'whatloom-github-test-'));
  try {
    const executable = join(directory, 'gh');
    await writeFile(executable, `#!${process.execPath}\nconst args=process.argv.slice(2);if(args[0]==='auth'&&args[1]==='token'){console.log('fixture-private-token');}else if(args.includes('.login')){console.log(process.env.GH_TOKEN==='fixture-private-token'?'alice':'wrong');}else if(args[1]==='wait'){setInterval(()=>{},1000);}else{console.log(JSON.stringify({token:process.env.GH_TOKEN,host:process.env.GH_HOST}));process.stderr.write(process.env.GH_TOKEN||'');}`);
    await chmod(executable, 0o700);
    const service = createGitHubConnectionService({ discover: async () => executable });
    const value = await service.run(['repo', 'view'], directory, undefined, 'alice');
    assert.deepEqual(JSON.parse(value.stdout), { token: '[redacted]', host: 'github.com' });
    assert.equal(value.stderr, '[redacted]');
    const controller = new AbortController();
    const pending = service.run(['repo', 'wait'], directory, controller.signal);
    const timer = setTimeout(() => controller.abort(), 75);
    try { await assert.rejects(pending, (error) => error.code === 'CANCELLED'); } finally { clearTimeout(timer); }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
