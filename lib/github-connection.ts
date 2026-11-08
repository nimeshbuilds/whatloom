import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { homedir, tmpdir } from 'node:os';
import { delimiter, isAbsolute, join } from 'node:path';
import { z } from 'zod';
import { AgentError, isAgentError, trackOwnedAgentProcess, type ProcessResult } from './agent-server.ts';

export interface GitHubAccount { login: string; name?: string }
export interface GitHubOwner extends GitHubAccount { type: 'User' | 'Organization' }
export interface GitHubLoginAttempt {
  id: string; status: 'pending' | 'connected' | 'cancelled' | 'error' | 'expired'; detail: string; url?: string; code?: string;
}
export interface GitHubConnection {
  status: 'connected' | 'disconnected' | 'pending' | 'unavailable' | 'error'; detail: string;
  account?: GitHubAccount; accounts?: { login: string; active: boolean }[]; owners?: GitHubOwner[]; attempt?: GitHubLoginAttempt;
}
export const githubLoginSchema = z.string().regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/);
export const githubActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('login') }).strict(),
  z.object({ action: z.literal('cancel'), attemptId: z.string().uuid() }).strict(),
  z.object({ action: z.literal('select-account'), account: githubLoginSchema }).strict(),
]);

type ExecuteOptions = { cwd?: string; signal?: AbortSignal; timeoutMs?: number; maxOutputBytes?: number;
  token?: string; onOutput?: (chunk: string) => void; git?: boolean };
type Execute = (executable: string, args: string[], options?: ExecuteOptions) => Promise<ProcessResult>;

export async function discoverGitHubExecutable(name = 'gh'): Promise<string | null> {
  for (const directory of new Set([...(process.env.PATH ?? '').split(delimiter), join(homedir(), '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'])) {
    if (!isAbsolute(directory)) continue;
    const candidate = join(directory, name);
    try { await access(candidate, constants.X_OK); if ((await stat(candidate)).isFile()) return candidate; } catch { /* Try another standard location. */ }
  }
  return null;
}

// The caller never receives auth-token output. Each account-bound operation gets
// a credential from gh's own store, only in its child's environment. No tokens
// are written into remotes, command arguments, project files, or browser state.
export function githubProcessEnvironment(token?: string, git = false): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^(?:GH_TOKEN|GITHUB_TOKEN|GH_ENTERPRISE_TOKEN|GITHUB_ENTERPRISE_TOKEN|GH_HOST|GH_REPO|GH_DEBUG|GIT_)/.test(key)) delete env[key];
  }
  Object.assign(env, { NO_COLOR: '1', GH_HOST: 'github.com', GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1', GIT_TERMINAL_PROMPT: '0' });
  if (token) env.GH_TOKEN = token;
  if (git) Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null' });
  return env;
}

export function redactGitHubOutput(value: string, token?: string): string {
  let safe = token ? value.split(token).join('[redacted]') : value;
  safe = safe.replace(/\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)\b/g, '[redacted]');
  return safe.replace(/(authorization\s*[:=]\s*(?:bearer|token)\s+)\S+/gi, '$1[redacted]');
}

const executeGitHubProcess: Execute = (executable, args, options = {}) => new Promise((resolve, reject) => {
  if (options.signal?.aborted) return reject(new AgentError('CANCELLED', 'The GitHub request was cancelled.', 499));
  const child = spawn(executable, args, { cwd: options.cwd ?? tmpdir(), shell: false, windowsHide: true,
    detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'], env: githubProcessEnvironment(options.token, options.git) });
  trackOwnedAgentProcess(child);
  let failure: AgentError | undefined; let settled = false; let size = 0;
  const stdout: Buffer[] = []; const stderr: Buffer[] = [];
  const stop = (error: AgentError) => {
    if (settled || failure) return; failure = error;
    try { if (child.pid && process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch { /* Already exited. */ }
  };
  const timer = setTimeout(() => stop(new AgentError('GITHUB_TIMEOUT', 'GitHub took too long to respond. Refresh and try again.', 504)), options.timeoutMs ?? 20_000);
  timer.unref();
  const abort = () => stop(new AgentError('CANCELLED', 'The GitHub request was cancelled.', 499));
  options.signal?.addEventListener('abort', abort, { once: true });
  const finish = (error?: AgentError, result?: ProcessResult) => {
    if (settled) return; settled = true; clearTimeout(timer); options.signal?.removeEventListener('abort', abort);
    if (error) reject(error); else resolve(result!);
  };
  const collect = (destination: Buffer[], chunk: Buffer) => {
    if (failure) return; size += chunk.byteLength;
    if (size > (options.maxOutputBytes ?? 2_000_000)) return stop(new AgentError('GITHUB_OUTPUT_TOO_LARGE', 'GitHub returned too much data. Try again.'));
    destination.push(chunk); options.onOutput?.(chunk.toString('utf8'));
  };
  child.stdout.on('data', (chunk: Buffer) => collect(stdout, chunk));
  child.stderr.on('data', (chunk: Buffer) => collect(stderr, chunk));
  child.stdin.on('error', () => { /* Early process exit. */ });
  child.once('error', () => finish(new AgentError('GITHUB_START_FAILED', 'GitHub CLI could not start. Check its installation.')));
  child.once('close', (exitCode) => finish(failure, { stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8'), exitCode }));
  child.stdin.end();
});

export function parseGitHubAccounts(result: ProcessResult): { login: string; active: boolean }[] {
  try {
    const value = JSON.parse(result.stdout);
    const items = value?.hosts?.['github.com'];
    if (!Array.isArray(items)) return [];
    return items.filter((item) => item?.state === 'success' && githubLoginSchema.safeParse(item.login).success)
      .map((item) => ({ login: item.login as string, active: item.active === true }));
  } catch { throw new AgentError('GITHUB_STATUS_FAILED', 'GitHub CLI could not report its accounts. Update GitHub CLI and refresh.'); }
}

export function parseGitHubDevicePrompt(output: string): { url?: string; code?: string } {
  const text = output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  const code = /(?:one[- ]time code|device code)\s*:\s*([A-Z0-9]{4}-[A-Z0-9]{4})(?![A-Z0-9-])/i.exec(text)?.[1]?.toUpperCase();
  const url = /https:\/\/github\.com\/login\/device(?:\s|$|[),.;])/i.test(text) ? 'https://github.com/login/device' : undefined;
  return { ...(url ? { url } : {}), ...(code ? { code } : {}) };
}

type Dependencies = { discover: typeof discoverGitHubExecutable; execute: Execute; loginTimeoutMs: number };
type InternalAttempt = GitHubLoginAttempt & { controller: AbortController; startedAt: number };

export function createGitHubConnectionService(overrides: Partial<Dependencies> = {}) {
  const deps: Dependencies = { discover: discoverGitHubExecutable, execute: executeGitHubProcess, loginTimeoutMs: 15 * 60_000, ...overrides };
  let attempt: InternalAttempt | undefined;
  let cache: { at: number; value: GitHubConnection } | undefined;
  let statusJob: Promise<GitHubConnection> | undefined;
  let changingAccount = false;
  let generation = 0;
  const clearCache = () => { generation += 1; cache = undefined; statusJob = undefined; };
  const executable = async () => {
    const gh = await deps.discover();
    if (!gh) throw new AgentError('GITHUB_NOT_INSTALLED', 'Install GitHub CLI, then return here to connect your GitHub account.', 503);
    return gh;
  };
  const accounts = async (gh: string) => parseGitHubAccounts(await deps.execute(gh, ['auth', 'status', '--hostname', 'github.com', '--json', 'hosts'], { maxOutputBytes: 64_000 }));
  const credential = async (gh: string, account: string, signal?: AbortSignal) => {
    githubLoginSchema.parse(account);
    const result = await deps.execute(gh, ['auth', 'token', '--hostname', 'github.com', '--user', account], { signal, maxOutputBytes: 16_000 });
    const token = result.stdout.trim();
    if (result.exitCode !== 0 || !token || token.length > 4096 || /\s/.test(token)) throw new AgentError('GITHUB_AUTH_REQUIRED', 'Reconnect the selected GitHub account before publishing.', 401);
    const identity = await deps.execute(gh, ['api', '--hostname', 'github.com', 'user', '--jq', '.login'], { token, signal, maxOutputBytes: 16_000 });
    if (identity.exitCode !== 0 || identity.stdout.trim().toLowerCase() !== account.toLowerCase()) throw new AgentError('GITHUB_ACCOUNT_CHANGED', 'The selected GitHub account could not be verified. Refresh your GitHub connection.', 409);
    return token;
  };
  async function run(args: string[], cwd?: string, signal?: AbortSignal, account?: string): Promise<ProcessResult> {
    if (args[0] === 'auth' && ['token', 'git-credential'].includes(args[1])) throw new AgentError('GITHUB_COMMAND_DENIED', 'This GitHub command is not available.', 400);
    const gh = await executable();
    const token = account ? await credential(gh, account, signal) : undefined;
    const result = await deps.execute(gh, args, { cwd, signal, token, timeoutMs: 90_000 });
    return { ...result, stdout: redactGitHubOutput(result.stdout, token), stderr: redactGitHubOutput(result.stderr, token) };
  }
  async function git(args: string[], cwd: string, signal?: AbortSignal, account?: string): Promise<ProcessResult> {
    if (!account) throw new AgentError('GITHUB_ACCOUNT_REQUIRED', 'Choose the GitHub account for this repository.', 400);
    if (!['push', 'ls-remote'].includes(args[0])) throw new AgentError('GITHUB_COMMAND_DENIED', 'This remote Git command is not available.', 400);
    const gh = await executable(); const gitPath = await deps.discover('git');
    if (!gitPath) throw new AgentError('GIT_NOT_INSTALLED', 'Install Git before publishing this project.', 503);
    const token = await credential(gh, account, signal);
    const quotedGh = `'${gh.replace(/'/g, `'"'"'`)}'`;
    const result = await deps.execute(gitPath, ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'protocol.allow=never', '-c', 'protocol.https.allow=always', '-c', 'credential.helper=',
      '-c', `credential.https://github.com.helper=!${quotedGh} auth git-credential`, ...args], { cwd, signal, token, git: true, timeoutMs: 120_000 });
    return { ...result, stdout: redactGitHubOutput(result.stdout, token), stderr: redactGitHubOutput(result.stderr, token) };
  }
  async function destination(account: string, owner: string) {
    githubLoginSchema.parse(owner); githubLoginSchema.parse(account);
    const gh = await executable(); const token = await credential(gh, account);
    if (owner.toLowerCase() === account.toLowerCase()) return { account: { login: account }, owner: { login: account, type: 'User' as const } };
    const result = await deps.execute(gh, ['api', '--hostname', 'github.com', `user/memberships/orgs/${owner}`], { token, maxOutputBytes: 32_000 });
    let value;
    try { value = JSON.parse(result.stdout); } catch { /* Invalid is not permission. */ }
    if (result.exitCode !== 0 || value?.state !== 'active' || value?.organization?.login?.toLowerCase() !== owner.toLowerCase()) {
      throw new AgentError('GITHUB_OWNER_UNAVAILABLE', 'The selected account does not have an active membership in this organization. Refresh and choose another destination.', 403);
    }
    return { account: { login: account }, owner: { login: value.organization.login as string, type: 'Organization' as const } };
  }
  async function readStatus(force = false): Promise<GitHubConnection> {
    if (!force && cache && Date.now() - cache.at < 3000) return cache.value;
    if (!force && statusJob) return statusJob;
    const version = generation;
    const job = (async (): Promise<GitHubConnection> => {
      const gh = await deps.discover();
      if (!gh) return { status: 'unavailable', detail: 'Install GitHub CLI, then return here to connect your GitHub account.' };
      try {
        const connectedAccounts = await accounts(gh);
        const active = connectedAccounts.find((item) => item.active);
        if (!active) return { status: 'disconnected', detail: 'Connect GitHub to choose where your finished product will be saved.', accounts: connectedAccounts };
        const token = await credential(gh, active.login);
        const [identity, orgs] = await Promise.all([
          deps.execute(gh, ['api', '--hostname', 'github.com', 'user', '--jq', '{login,name}'], { token, maxOutputBytes: 32_000 }),
          deps.execute(gh, ['api', '--hostname', 'github.com', 'user/orgs?per_page=100', '--paginate', '--slurp'], { token }),
        ]);
        const user = JSON.parse(identity.stdout);
        if (identity.exitCode !== 0 || user.login?.toLowerCase() !== active.login.toLowerCase()) throw new Error('Identity changed');
        const account: GitHubAccount = { login: active.login, ...(typeof user.name === 'string' && user.name ? { name: user.name.slice(0, 160) } : {}) };
        const owners: GitHubOwner[] = [{ ...account, type: 'User' }];
        if (orgs.exitCode === 0) {
          const pages = JSON.parse(orgs.stdout);
          if (!Array.isArray(pages) || !pages.every(Array.isArray)) throw new Error('Invalid organizations');
          for (const org of pages.flat()) if (githubLoginSchema.safeParse(org?.login).success && !owners.some((item) => item.login.toLowerCase() === org.login.toLowerCase())) owners.push({ login: org.login, type: 'Organization' });
        }
        return { status: 'connected', detail: orgs.exitCode === 0 ? 'Connected through GitHub CLI. Choose your account or an organization; GitHub checks repository creation permissions when publishing.' : 'Your account is connected, but organizations could not be loaded. Reconnect to grant organization access, or refresh and try again.', account, accounts: connectedAccounts, owners };
      } catch { return { status: 'error', detail: 'GitHub could not verify your account. Check your connection, reconnect, or refresh.' }; }
    })();
    statusJob = job;
    try { const value = await job; if (version === generation) cache = { at: Date.now(), value }; return value; }
    finally { if (statusJob === job) statusJob = undefined; }
  }
  const snapshot = (value: InternalAttempt): GitHubLoginAttempt => ({ id: value.id, status: value.status, detail: value.detail,
    ...(value.status === 'pending' && value.url ? { url: value.url } : {}), ...(value.status === 'pending' && value.code ? { code: value.code } : {}) });
  const loginPending = () => attempt?.status === 'pending';
  async function status(force = false): Promise<GitHubConnection> {
    const value = await readStatus(force);
    if (attempt && attempt.status !== 'pending' && Date.now() - attempt.startedAt > 20 * 60_000) attempt = undefined;
    return attempt ? { ...value, ...(attempt.status === 'pending' ? { status: 'pending' as const, detail: attempt.detail } : {}), attempt: snapshot(attempt) } : value;
  }
  async function login(): Promise<GitHubConnection> {
    if (changingAccount) throw new AgentError('GITHUB_BUSY', 'Wait for the account change to finish.', 409);
    if (loginPending()) return status();
    const gh = await executable();
    if (loginPending()) return status();
    if (changingAccount) throw new AgentError('GITHUB_BUSY', 'Wait for the account change to finish.', 409);
    const next: InternalAttempt = { id: randomUUID(), status: 'pending', detail: 'Copy the one-time code and finish connecting on GitHub in your browser.', controller: new AbortController(), startedAt: Date.now() };
    attempt = next; clearCache(); let tail = '';
    void deps.execute(gh, ['auth', 'login', '--hostname', 'github.com', '--git-protocol', 'https', '--web', '--clipboard=false', '--scopes', 'repo,read:org,workflow', '--skip-ssh-key'], {
      timeoutMs: deps.loginTimeoutMs, maxOutputBytes: 64_000, signal: next.controller.signal,
      onOutput: (chunk) => { tail = (tail + chunk).slice(-16_000); if (next.status === 'pending') Object.assign(next, parseGitHubDevicePrompt(tail)); },
    }).then(async (result) => {
      if (next.status !== 'pending') return; clearCache();
      const verified = await readStatus(true);
      if (next.status !== 'pending') return;
      next.status = result.exitCode === 0 && verified.status === 'connected' ? 'connected' : 'error';
      next.detail = next.status === 'connected' ? 'GitHub is connected. Choose the account or organization for your product.' : 'Sign-in did not finish. Connect again and complete the browser flow.';
    }).catch((error: unknown) => {
      if (next.status !== 'pending') return;
      next.status = isAgentError(error) && error.code === 'GITHUB_TIMEOUT' ? 'expired' : 'error';
      next.detail = next.status === 'expired' ? 'This sign-in expired. Connect again for a new code.' : 'GitHub sign-in could not finish. Try again.';
    }).finally(() => { next.url = undefined; next.code = undefined; tail = ''; clearCache(); });
    return { status: 'pending', detail: next.detail, attempt: snapshot(next) };
  }
  async function cancel(attemptId: string): Promise<GitHubConnection> {
    if (!attempt || attempt.id !== attemptId) throw new AgentError('GITHUB_LOGIN_NOT_FOUND', 'That GitHub sign-in is no longer active. Refresh the connection.', 409);
    if (attempt.status === 'pending') { attempt.status = 'cancelled'; attempt.detail = 'Sign-in cancelled.'; attempt.url = undefined; attempt.code = undefined; attempt.controller.abort(); clearCache(); }
    return status(true);
  }
  async function selectAccount(account: string): Promise<GitHubConnection> {
    githubLoginSchema.parse(account);
    if (changingAccount || attempt?.status === 'pending') throw new AgentError('GITHUB_BUSY', 'Finish or cancel the current GitHub connection first.', 409);
    changingAccount = true; clearCache();
    try {
      const gh = await executable();
      if (!(await accounts(gh)).some((item) => item.login.toLowerCase() === account.toLowerCase())) throw new AgentError('GITHUB_ACCOUNT_NOT_FOUND', 'Connect this GitHub account before selecting it.', 409);
      const result = await deps.execute(gh, ['auth', 'switch', '--hostname', 'github.com', '--user', account]);
      if (result.exitCode !== 0) throw new AgentError('GITHUB_SWITCH_FAILED', 'GitHub could not select this account. Reconnect and try again.', 409);
      clearCache(); const value = await status(true);
      if (value.account?.login.toLowerCase() !== account.toLowerCase()) throw new AgentError('GITHUB_ACCOUNT_CHANGED', 'The active GitHub account changed. Refresh and select it again.', 409);
      return value;
    } finally { changingAccount = false; }
  }
  async function assertOwner(owner: string, account?: string) {
    const selected = account ?? (await status(true)).account?.login;
    if (!selected) throw new AgentError('GITHUB_AUTH_REQUIRED', 'Connect GitHub before publishing this product.', 401);
    return destination(selected, owner);
  }
  async function assertNewRepository(owner: string, repository: string, account: string) {
    githubLoginSchema.parse(owner); githubLoginSchema.parse(account);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(repository) || /\.git$/i.test(repository)) throw new AgentError('GITHUB_REPOSITORY_INVALID', 'Choose a repository name using letters, numbers, dots, dashes, or underscores.', 400);
    await destination(account, owner);
    const result = await run(['api', '--hostname', 'github.com', '--include', '--silent', `repos/${owner}/${repository}`], undefined, undefined, account);
    if (result.exitCode === 0) throw new AgentError('GITHUB_REPOSITORY_EXISTS', 'A repository with this name already exists. Choose a different name; Whatloom will create a new repository.', 409);
    if (!/^HTTP\/[\d.]+\s+404\b/m.test(result.stdout)) throw new AgentError('GITHUB_REPOSITORY_CHECK_FAILED', 'GitHub could not check this repository name. Check your connection and organization permissions, then try again.', 502);
  }
  return { status, login, cancel, selectAccount, assertOwner, assertNewRepository, run, git };
}

const connectionGlobal = globalThis as typeof globalThis & { __whatloomGitHub?: ReturnType<typeof createGitHubConnectionService> };
export const githubConnections = connectionGlobal.__whatloomGitHub ??= createGitHubConnectionService();
export const getGitHubConnection = githubConnections.status;
export const assertGitHubOwner = githubConnections.assertOwner;
export const assertGitHubNewRepository = githubConnections.assertNewRepository;
export const runGitHub = githubConnections.run;
export const runGitHubGit = githubConnections.git;
