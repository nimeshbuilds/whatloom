import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { z } from 'zod';
import {
  AgentError, discoverExecutable, isAgentError, modelSchema, runBoundedProcess, trackOwnedAgentProcess,
  type AgentProvider, type ProcessResult,
} from './agent-server.ts';

export type ConnectionState = 'connected' | 'disconnected' | 'pending' | 'unavailable' | 'error';
export type LoginState = 'pending' | 'connected' | 'cancelled' | 'error' | 'expired';
export interface LoginAttempt { id: string; status: LoginState; url?: string; detail: string }
export interface AgentConnection {
  provider: AgentProvider; status: ConnectionState; authMethod?: string; detail: string; attempt?: LoginAttempt;
}
export interface AgentModel { id: string; name: string; description?: string; isDefault?: boolean }
export interface AgentModels { provider: AgentProvider; models: AgentModel[]; source: 'live' | 'documented'; detail: string }

export const providerSchema = z.enum(['codex', 'claude']);
export const authActionSchema = z.object({
  provider: providerSchema, action: z.enum(['start', 'cancel']), attemptId: z.string().uuid().optional(),
}).strict().refine((input) => input.action !== 'cancel' || Boolean(input.attemptId), { message: 'Choose the login to cancel.' });

// This list identifies destinations owned by the provider, not arbitrary links
// found in CLI output. OAuth state and PKCE challenge belong in the browser URL;
// authorization codes, access tokens and credentials never belong in our UI.
export function safeAuthUrl(provider: AgentProvider, candidate: string): string | undefined {
  try {
    if (candidate.length > 8000) return;
    const url = new URL(candidate);
    const hosts = provider === 'codex' ? ['auth.openai.com', 'chatgpt.com'] : ['claude.ai', 'console.anthropic.com', 'platform.claude.com'];
    if (url.protocol !== 'https:' || !hosts.includes(url.hostname) || url.port || url.username || url.password || url.hash) return;
    if (!/^\/(?:oauth\/authorize|authorize|auth\/authorize)\/?$/.test(url.pathname)) return;
    const allowedParameters = new Set(['client_id', 'response_type', 'redirect_uri', 'scope', 'state', 'code_challenge',
      'code_challenge_method', 'originator', 'codex_cli_simplified_flow', 'id_token_add_organizations', 'prompt',
      'preselect_account_type', 'expires_in', 'audience', 'resource', 'screen_hint', 'code']);
    for (const key of url.searchParams.keys()) {
      if (!allowedParameters.has(key)) return;
      // Claude's official authorization URL uses code=true to select its
      // browser code flow. This boolean is not an authorization code.
      if (provider === 'claude' && key === 'code' && url.searchParams.getAll(key).length === 1 && url.searchParams.get(key) === 'true') continue;
      if (/^(?:access_token|refresh_token|id_token|token|code|password|api_key|client_secret)$/i.test(key)) return;
    }
    const redirect = url.searchParams.get('redirect_uri');
    if (redirect) {
      const callback = new URL(redirect);
      const loopback = callback.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(callback.hostname);
      const providerCallback = callback.protocol === 'https:' && hosts.includes(callback.hostname) && /^\/oauth\/code\/callback\/?$/.test(callback.pathname);
      if ((!loopback && !providerCallback) || callback.username || callback.password || callback.search || callback.hash) return;
    }
    return url.toString();
  } catch { return; }
}

export function extractAuthUrl(provider: AgentProvider, output: string): string | undefined {
  const plain = output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  for (const match of plain.matchAll(/https:\/\/[^\s<>"']+/g)) {
    const safe = safeAuthUrl(provider, match[0].replace(/[),.;]+$/, ''));
    if (safe) return safe;
  }
}

export function parseAuthStatus(provider: AgentProvider, result: ProcessResult): AgentConnection {
  const base = { provider };
  if (provider === 'claude') {
    try {
      const value = JSON.parse(result.stdout);
      if (value && typeof value === 'object' && typeof value.loggedIn === 'boolean') {
        const methods = ['claude.ai', 'oauth_token', 'api_key', 'api_key_helper', 'third_party'];
        const authMethod = methods.includes(value.authMethod) ? value.authMethod as string : undefined;
        const connected = value.loggedIn === true && result.exitCode === 0;
        return { ...base, status: connected ? 'connected' : 'disconnected', ...(connected && authMethod ? { authMethod } : {}),
          detail: connected ? 'Connected through the official Claude Code login. Model access is checked when you run a task.' : 'Connect Claude Code to continue with your account.' };
      }
    } catch { /* Unsupported or incomplete status output is not a successful login. */ }
    return { ...base, status: 'error', detail: 'Claude Code could not report its connection. Update the official app and refresh the connection.' };
  }
  if (result.exitCode === 0) {
    const text = result.stdout + result.stderr;
    const authMethod = /chatgpt/i.test(text) ? 'chatgpt' : /api.?key/i.test(text) ? 'api_key' : undefined;
    return { ...base, status: 'connected', ...(authMethod ? { authMethod } : {}), detail: 'Connected through the official Codex login. Model access is checked when you run a task.' };
  }
  if (result.exitCode === 1) return { ...base, status: 'disconnected', detail: 'Connect Codex to continue with your account.' };
  return { ...base, status: 'error', detail: 'Codex could not report its connection. Refresh or update the official app.' };
}

interface InternalAttempt extends LoginAttempt { controller: AbortController; startedAt: number }
type Dependencies = {
  discover: typeof discoverExecutable;
  run: typeof runBoundedProcess;
  catalog: (executable: string) => Promise<AgentModel[]>;
  loginTimeoutMs: number;
};

// A factory makes process behavior testable without ever signing the developer
// in or out. Production holds just two provider records in server memory.
export function createAgentConnectionService(overrides: Partial<Dependencies> = {}) {
  const deps: Dependencies = { discover: discoverExecutable, run: runBoundedProcess, catalog: readCodexModels, loginTimeoutMs: 180_000, ...overrides };
  const attempts = new Map<AgentProvider, InternalAttempt>();
  const statuses = new Map<AgentProvider, { at: number; value: AgentConnection }>();
  const statusJobs = new Map<AgentProvider, Promise<AgentConnection>>();
  const catalogs = new Map<AgentProvider, { at: number; value: AgentModels }>();
  const modelJobs = new Map<AgentProvider, Promise<AgentModels>>();
  const snapshot = (attempt: InternalAttempt): LoginAttempt => ({ id: attempt.id, status: attempt.status,
    ...(attempt.status === 'pending' && attempt.url ? { url: attempt.url } : {}), detail: attempt.detail });

  async function readStatus(provider: AgentProvider, force = false): Promise<AgentConnection> {
    const cached = statuses.get(provider);
    if (!force && cached && Date.now() - cached.at < 2000) return cached.value;
    const pending = statusJobs.get(provider);
    if (pending) return pending;
    const job = (async () => {
      const executable = await deps.discover(provider);
      let value: AgentConnection;
      if (!executable) value = { provider, status: 'unavailable', detail: `Install the official ${provider === 'codex' ? 'Codex' : 'Claude Code'} app, then return here to connect.` };
      else {
        try {
          value = parseAuthStatus(provider, await deps.run(executable, provider === 'codex' ? ['login', 'status'] : ['auth', 'status', '--json'],
            { cwd: tmpdir(), timeoutMs: 6000, maxOutputBytes: 16_000 }));
        } catch { value = { provider, status: 'error', detail: 'The agent could not report its connection. Refresh and try again.' }; }
      }
      statuses.set(provider, { at: Date.now(), value });
      return value;
    })();
    statusJobs.set(provider, job);
    try { return await job; } finally { statusJobs.delete(provider); }
  }

  async function status(provider: AgentProvider): Promise<AgentConnection> {
    const value = await readStatus(provider);
    const attempt = attempts.get(provider);
    if (!attempt) return value;
    if (Date.now() - attempt.startedAt > 10 * 60_000 && attempt.status !== 'pending') { attempts.delete(provider); return value; }
    return { ...value, ...(attempt.status === 'pending' ? { status: 'pending' as const, detail: attempt.detail } : {}), attempt: snapshot(attempt) };
  }

  async function start(provider: AgentProvider): Promise<AgentConnection> {
    const current = attempts.get(provider);
    if (current?.status === 'pending') return status(provider);
    const connection = await readStatus(provider, true);
    if (connection.status === 'connected' || connection.status === 'unavailable') return connection;
    const executable = await deps.discover(provider);
    if (!executable) return connection;
    // Recheck after awaited discovery: concurrent clicks must share one login.
    if (attempts.get(provider)?.status === 'pending') return status(provider);
    const attempt: InternalAttempt = { id: randomUUID(), status: 'pending', startedAt: Date.now(), controller: new AbortController(),
      detail: 'Complete the official sign-in in your browser. You can return here while it finishes.' };
    attempts.set(provider, attempt);
    let tail = '';
    void deps.run(executable, provider === 'codex' ? ['login'] : ['auth', 'login', '--claudeai'], {
      cwd: tmpdir(), timeoutMs: deps.loginTimeoutMs, maxOutputBytes: 64_000, signal: attempt.controller.signal,
      onOutput: (chunk) => {
        tail = (tail + chunk).slice(-16_000);
        const url = extractAuthUrl(provider, tail);
        if (url && attempt.status === 'pending') attempt.url = url;
      },
    }).then(async (result) => {
      if (attempt.status !== 'pending') return;
      statuses.delete(provider);
      const verified = await readStatus(provider, true);
      if (attempt.status !== 'pending') return;
      attempt.status = result.exitCode === 0 && verified.status === 'connected' ? 'connected' : 'error';
      attempt.detail = attempt.status === 'connected' ? 'Connected. Your credentials stay with the official agent.' : 'Sign-in did not complete. Try Connect again and finish the official browser flow.';
      attempt.url = undefined;
    }).catch((error: unknown) => {
      if (attempt.status !== 'pending') return;
      attempt.status = isAgentError(error) && error.code === 'TIMEOUT' ? 'expired' : 'error';
      attempt.detail = attempt.status === 'expired' ? 'This sign-in expired. Start a new connection when you are ready.' : 'The official sign-in could not finish. Try again.';
      attempt.url = undefined;
    }).finally(() => { tail = ''; statuses.delete(provider); catalogs.delete(provider); });
    return { provider, status: 'pending', detail: attempt.detail, attempt: snapshot(attempt) };
  }

  async function cancel(provider: AgentProvider, attemptId: string): Promise<AgentConnection> {
    const attempt = attempts.get(provider);
    if (!attempt || attempt.id !== attemptId) throw new AgentError('LOGIN_NOT_FOUND', 'That sign-in is no longer active. Refresh the connection.', 409);
    if (attempt.status === 'pending') {
      attempt.status = 'cancelled'; attempt.detail = 'Sign-in cancelled. Your existing account connection was not changed.';
      attempt.url = undefined; attempt.controller.abort();
    }
    statuses.delete(provider);
    return status(provider);
  }

  async function models(provider: AgentProvider): Promise<AgentModels> {
    const cached = catalogs.get(provider);
    if (cached && Date.now() - cached.at < 60_000) return cached.value;
    const pending = modelJobs.get(provider);
    if (pending) return pending;
    const job = (async (): Promise<AgentModels> => {
      if (!await deps.discover(provider)) throw new AgentError('AGENT_NOT_INSTALLED', 'Install the official agent to discover its models.', 503);
      const value: AgentModels = provider === 'claude' ? {
        provider, source: 'documented', models: [
          { id: 'default', name: 'Account default', isDefault: true, description: 'Use the default selected by Claude Code for your account.' },
          { id: 'sonnet', name: 'Sonnet', description: 'Official Sonnet alias.' },
          { id: 'opus', name: 'Opus', description: 'Official Opus alias.' },
          { id: 'haiku', name: 'Haiku', description: 'Official Haiku alias.' },
        ], detail: 'Official Claude Code aliases. Availability depends on your account and is checked when a task runs.',
      } : { provider, source: 'live', models: await deps.catalog((await deps.discover(provider))!),
        detail: 'Catalog returned by your installed Codex app-server. Listing a model does not verify account access.' };
      catalogs.set(provider, { at: Date.now(), value });
      return value;
    })();
    modelJobs.set(provider, job);
    try { return await job; } finally { modelJobs.delete(provider); }
  }
  return { status, start, cancel, models };
}

export function parseCodexModels(value: unknown): AgentModel[] {
  const parsed = z.object({ data: z.array(z.object({
    id: z.string().optional(), model: z.string().optional(), displayName: z.string().optional(),
    description: z.string().optional(), isDefault: z.boolean().optional(), hidden: z.boolean().optional(),
  }).passthrough()).max(100) }).passthrough().safeParse(value);
  if (!parsed.success) throw new AgentError('MODELS_UNAVAILABLE', 'Codex did not return a usable model catalog. Refresh or update Codex.');
  const models: AgentModel[] = [];
  for (const item of parsed.data.data) {
    const id = item.model ?? item.id;
    if (item.hidden || !modelSchema.safeParse(id).success || models.some((model) => model.id === id)) continue;
    models.push({ id: id!, name: (item.displayName || id!).slice(0, 160), ...(item.description ? { description: item.description.slice(0, 600) } : {}), ...(item.isDefault !== undefined ? { isDefault: item.isDefault } : {}) });
  }
  if (!models.length) throw new AgentError('MODELS_UNAVAILABLE', 'Codex returned no selectable models. Connect your account and refresh.');
  return models;
}

export function readCodexModels(executable: string, timeoutMs = 10_000): Promise<AgentModel[]> {
  return new Promise((resolve, reject) => {
    // No thread/turn is created: this protocol session only reads the catalog.
    const child = spawn(executable, ['app-server', '--listen', 'stdio://'], {
      cwd: tmpdir(), shell: false, detached: process.platform !== 'win32', windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' },
    });
    trackOwnedAgentProcess(child);
    let settled = false;
    let buffer = '';
    let bytes = 0;
    const stop = () => {
      try { if (child.pid && process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch { /* Already exited. */ }
    };
    const finish = (error?: AgentError, models?: AgentModel[]) => {
      if (settled) return;
      settled = true; clearTimeout(timer); stop();
      if (error) reject(error); else resolve(models!);
    };
    const timer = setTimeout(() => finish(new AgentError('MODELS_UNAVAILABLE', 'The Codex model catalog took too long. Refresh to try again.', 504)), timeoutMs);
    timer.unref();
    const send = (message: object) => { if (!settled) child.stdin.write(JSON.stringify(message) + '\n'); };
    child.stdin.on('error', () => { /* Error/close handlers supply a safe message. */ });
    child.stderr.on('data', (chunk: Buffer) => {
      bytes += chunk.byteLength;
      if (bytes > 500_000) finish(new AgentError('MODELS_UNAVAILABLE', 'Codex returned an oversized model catalog. Update Codex and try again.'));
    });
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.byteLength;
      if (bytes > 500_000) return finish(new AgentError('MODELS_UNAVAILABLE', 'Codex returned an oversized model catalog. Update Codex and try again.'));
      buffer += chunk.toString('utf8');
      for (;;) {
        const boundary = buffer.indexOf('\n');
        if (boundary < 0) break;
        const line = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 1);
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        if (message?.id === 1) {
          if (message.error) return finish(new AgentError('MODELS_UNAVAILABLE', 'This Codex version does not support model discovery. Update Codex and refresh.'));
          send({ method: 'initialized' });
          send({ id: 2, method: 'model/list', params: { limit: 100, includeHidden: false } });
        } else if (message?.id === 2) {
          if (message.error) return finish(new AgentError('MODELS_UNAVAILABLE', 'Codex could not load its model catalog. Check your connection and refresh.'));
          try { finish(undefined, parseCodexModels(message.result)); }
          catch (error) { finish(isAgentError(error) ? error : new AgentError('MODELS_UNAVAILABLE', 'Codex returned an invalid model catalog.')); }
        }
      }
    });
    child.once('error', () => finish(new AgentError('MODELS_UNAVAILABLE', 'The Codex app-server could not start. Check its installation.')));
    child.once('close', () => finish(new AgentError('MODELS_UNAVAILABLE', 'Codex stopped before returning its model catalog. Update Codex and refresh.')));
    send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'whatloom', title: 'Whatloom', version: '0.1.0' } } });
  });
}

const connectionGlobal = globalThis as typeof globalThis & { __whatloomConnections?: ReturnType<typeof createAgentConnectionService> };
export const agentConnections = connectionGlobal.__whatloomConnections ??= createAgentConnectionService();
