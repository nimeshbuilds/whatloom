import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { access, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, delimiter, isAbsolute, join, relative, resolve } from 'node:path';
import { z } from 'zod';
import { AgentError, trackOwnedAgentProcess } from './agent-server.ts';
import type { ProcessResult } from './agent-server.ts';
import { assertGitHubOwner, runGitHub, runGitHubGit } from './github-connection.ts';

const text = (max: number) => z.string().trim().min(1).max(max);
export const githubPublishTargetSchema = z.object({
  account: z.string().regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/),
  owner: z.string().regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/),
  repository: z.string().min(1).max(100).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/).refine(value => !value.toLowerCase().endsWith('.git') && !['.', '..'].includes(value)),
  visibility: z.enum(['private', 'public']).default('private'),
}).strict();
export type GitHubPublishTarget = z.infer<typeof githubPublishTargetSchema>;
export const verificationManifestSchema = z.object({
  completed: z.literal(true), summary: text(4000),
  checks: z.array(z.object({
    name: text(160), kind: z.enum(['test', 'smoke', 'build', 'lint', 'typecheck']),
    command: z.array(text(500)).min(2).max(24), covers: z.array(text(500)).max(20),
  }).strict()).min(1).max(12),
  limitations: z.array(text(1000)).max(30),
}).strict().superRefine((value, context) => {
  if (!value.checks.some(check => ['test', 'smoke'].includes(check.kind) && check.covers.length)) context.addIssue({ code: 'custom', message: 'Include a test or smoke check covering a real user journey.' });
});
export type VerificationManifest = z.infer<typeof verificationManifestSchema>;
export interface FounderVerification {
  passed: true; summary: string; verifiedAt: string; filesDigest: string; fileCount: number;
  checks: (VerificationManifest['checks'][number] & { exitCode: 0; durationMs: number })[];
  limitations: string[];
}
export interface FounderPublication {
  account: string; owner: string; repository: string; visibility: 'private' | 'public';
  url: string; commit: string; publishedAt: string;
}
export interface SafeProcessOptions { cwd: string; env: NodeJS.ProcessEnv; signal?: AbortSignal; timeoutMs: number; maxOutputBytes: number }
export type SafeProcessRunner = (executable: string, args: string[], options: SafeProcessOptions) => Promise<ProcessResult>;
type CommonOptions = { signal?: AbortSignal; onLog?: (message: string) => void; execute?: SafeProcessRunner; discover?: (name: string) => Promise<string | null> };
type PublicationOptions = CommonOptions & {
  verification: FounderVerification; stateRoot?: string;
  assertOwner?: typeof assertGitHubOwner; github?: typeof runGitHub; githubGit?: typeof runGitHubGit;
};

export function verificationManifestExample(): VerificationManifest {
  return { completed: true, summary: 'Describe the implementation and actual checks completed.', checks: [{ name: 'Primary user journey', kind: 'test', command: ['node', '--test', 'tests/journey.test.mjs'], covers: ['Describe an approved user journey exercised by this test.'] }], limitations: ['Describe remaining limitations honestly.'] };
}

function fail(code: string, message: string): never { throw new AgentError(code, message, 409); }
function githubFailure(result: ProcessResult, code: string, message: string): never {
  const output = `${result.stdout}\n${result.stderr}`;
  if (/\bSAML\b|\bSSO\b|single.sign.on/i.test(output)) fail('GITHUB_SSO_REQUIRED', 'Authorize the selected GitHub account for your organization’s single sign-on (SSO), then choose Retry tests & publish. Your local app and commit are safe.');
  if (/GH013|repository rule|rule violations?|protected branch|organization.{0,60}policy|(?:commits?|signatures?).{0,30}(?:must|require).{0,30}sign/i.test(output)) fail('GITHUB_POLICY_REQUIRED', 'Your organization’s repository rules blocked publication. Review the repository policy with an organization owner, then choose Retry tests & publish. Whatloom will not bypass those rules.');
  if (/scope|refusing.{0,100}workflow|workflow.{0,100}permission/i.test(output)) fail('GITHUB_SCOPE_REQUIRED', 'Reconnect GitHub in Whatloom to grant repository, organization, and workflow access, then choose Retry tests & publish. Your local app and commit are safe.');
  if (/HTTP\s+401|Bad credentials|authentication failed/i.test(output)) fail('GITHUB_AUTH_REQUIRED', 'Reconnect the selected GitHub account in Whatloom, then choose Retry tests & publish. Your local app and commit are safe.');
  if (/HTTP\s+403|permission.{0,40}denied|not accessible|not permitted|insufficient permission/i.test(output)) fail('GITHUB_PERMISSION_REQUIRED', 'Reconnect GitHub with repository, organization, and workflow access. If the organization restricts repository creation or pushes, ask an organization owner to grant access, then choose Retry tests & publish.');
  fail(code, message);
}
function redact(value: string): string {
  return value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-(?:ant-)?[A-Za-z0-9_-]{12,})\b/g, '[redacted credential]').replace(/((?:token|secret|password|api[_-]?key|authorization)["']?\s*[:=]\s*["']?)(?:Bearer\s+)?[^\s,;"'}]+/gi, '$1[redacted]').slice(-4000);
}

/** Bounded process groups, no shell interpolation, and a caller-supplied environment. */
export const executeBuildCheck: SafeProcessRunner = (executable, args, options) => new Promise((resolveResult, reject) => {
  if (options.signal?.aborted) return reject(new AgentError('CANCELLED', 'Verification was cancelled.', 499));
  const child = spawn(executable, args, { cwd: options.cwd, env: options.env, shell: false, detached: process.platform !== 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  trackOwnedAgentProcess(child);
  let failure: AgentError | undefined; let total = 0; const stdout: Buffer[] = []; const stderr: Buffer[] = [];
  let force: ReturnType<typeof setTimeout> | undefined;
  const stop = (error: AgentError) => {
    if (failure) return; failure = error;
    try { if (child.pid && process.platform !== 'win32') process.kill(-child.pid, 'SIGTERM'); else child.kill('SIGTERM'); } catch { /* Already stopped. */ }
    force = setTimeout(() => { try { if (child.pid && process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch { /* Already stopped. */ } }, 1000); force.unref();
  };
  const timer = setTimeout(() => stop(new AgentError('VERIFICATION_TIMEOUT', 'A verification command exceeded five minutes. Publication is paused.', 504)), options.timeoutMs); timer.unref();
  const abort = () => stop(new AgentError('CANCELLED', 'Verification was cancelled.', 499)); options.signal?.addEventListener('abort', abort, { once: true });
  const cleanup = () => { clearTimeout(timer); if (force) clearTimeout(force); options.signal?.removeEventListener('abort', abort); };
  const collect = (chunks: Buffer[], chunk: Buffer) => { total += chunk.length; if (total > options.maxOutputBytes) stop(new AgentError('VERIFICATION_OUTPUT_LIMIT', 'A check produced too much output. Publication is paused.', 409)); else chunks.push(chunk); };
  child.stdout.on('data', chunk => collect(stdout, chunk)); child.stderr.on('data', chunk => collect(stderr, chunk));
  child.on('error', () => { cleanup(); reject(new AgentError('VERIFICATION_START_FAILED', `Could not start ${basename(executable)}. Install the required local tool and retry.`, 409)); });
  child.on('close', exitCode => { cleanup(); if (failure) reject(failure); else resolveResult({ stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8'), exitCode }); });
});

async function findTool(name: string): Promise<string | null> {
  if (name === 'node') return process.execPath;
  for (const directory of new Set([...(process.env.PATH ?? '').split(delimiter), join(homedir(), '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'])) {
    if (!isAbsolute(directory)) continue;
    const path = join(directory, name);
    try { await access(path, constants.X_OK); if ((await lstat(path)).isFile() || (await lstat(path)).isSymbolicLink()) return path; } catch { /* Try another standard tool location. */ }
  }
  return null;
}

const ignoredDirectories = new Set(['.whatloom', '.git', 'node_modules', 'bower_components', '.next', '.nuxt', '.output', '.vercel', '.netlify', 'dist', 'build', 'out', 'coverage', 'htmlcov', 'test-results', 'playwright-report', '.nyc_output', '.cache', '.parcel-cache', '.turbo', '.venv', 'venv', '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache', 'target', '.build', 'obj', '.idea', '.vscode']);
const privateNames = /^(?:\.env(?:\..*)?|\.npmrc|\.yarnrc(?:\.yml)?|\.pypirc|\.netrc|\.gitconfig|\.DS_Store|id_(?:rsa|ed25519|ecdsa)(?:\.pub)?|credentials(?:\..*)?|secrets?(?:\..*)?|WHATLOOM-BUILD\.md|PRODUCT-BRIEF\.md|README-WHATLOOM\.md)$/i;
const privateExtensions = /\.(?:pem|key|p12|pfx|keystore|mobileprovision|log|sqlite|sqlite3|db|tsbuildinfo|pyc)$/i;
interface ScreenedFile { name: string; data: Buffer; mode: number }
interface ScreenedFiles { files: ScreenedFile[]; digest: string }
function hasImplementation(names: string[]): boolean {
  return names.some(name => /\.(?:[cm]?[jt]sx?|html|css|py|rs|go|swift|java|kt|cs|rb|php|vue|svelte)$/i.test(name) && !/(?:^|\/)(?:brand|tests?|__tests__)\/|(?:\.test|\.spec)\.[^/]+$/.test(name));
}
function digestFiles(files: ScreenedFile[]): string {
  const digest = createHash('sha256');
  for (const file of [...files].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) { digest.update(`${file.name}\0${file.mode}\0${file.data.length}\0`); digest.update(file.data); }
  return digest.digest('hex');
}
function checkedTreeDigest(tree: string, files: ScreenedFile[]): string {
  const screened = new Map(files.map(file => [file.name, file]));
  const committed: ScreenedFile[] = [];
  for (const record of tree.split('\0').filter(Boolean)) {
    const entry = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(record);
    const file = entry ? screened.get(entry[3]) : undefined;
    if (!entry || !file || parseInt(entry[1], 8) % 0o100000 !== file.mode || createHash('sha1').update(`blob ${file.data.length}\0`).update(file.data).digest('hex') !== entry[2]) {
      fail('PUBLICATION_SNAPSHOT_CHANGED', 'The staged source does not match the checked files. Check Git attributes or source changes, then verify the app again.');
    }
    committed.push(file);
  }
  if (!hasImplementation(committed.map(file => file.name)) || !committed.some(file => file.name === 'TESTING.md')) fail('PUBLICATION_FILES_IGNORED', 'The app’s .gitignore excludes its implementation or TESTING.md. Keep private data ignored, but include the product source and testing evidence before publishing.');
  return digestFiles(committed);
}
function hasCredential(data: Buffer): boolean {
  const value = data.toString('utf8');
  return /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9_]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}|\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|\bsk-(?:ant-)?[A-Za-z0-9_-]{24,}|\bxox[baprs]-[A-Za-z0-9-]{20,}/.test(value)
    || /(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[=:]\s*["'](?!\$\{|process\.|os\.|YOUR_|your_|REPLACE_|replace_|example|placeholder|test|dummy|changeme|<)[A-Za-z0-9_+/.=-]{20,}["']/i.test(value);
}

async function screenFiles(directory: string): Promise<ScreenedFiles> {
  const files: ScreenedFile[] = []; let total = 0;
  const visit = async (folder: string, prefix = '') => {
    for (const name of (await readdir(folder)).sort()) {
      if (/[^\x20-\x7e]|[\r\n\\]/.test(name)) fail('UNSAFE_BUILD_FILE', 'A generated filename cannot be safely published. Rename it using ordinary printable characters.');
      const path = join(folder, name); const display = prefix ? `${prefix}/${name}` : name;
      const envTemplate = /^\.env\.(?:example|sample|template)$/i.test(name);
      if (ignoredDirectories.has(name) || (privateNames.test(name) && !envTemplate) || privateExtensions.test(name) || name === '.coverage') continue;
      if (name === '.gitmodules') fail('UNSAFE_BUILD_FILE', 'Generated submodules are not supported for automatic publication.');
      const info = await lstat(path);
      if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile())) fail('UNSAFE_BUILD_FILE', `Remove the link or special file ${display} before publishing.`);
      if (info.isDirectory()) { if (prefix.split('/').length > 24) fail('BUILD_TOO_LARGE', 'The generated directory is too deeply nested.'); await visit(path, display); continue; }
      if (info.size > 10_000_000 || (total += info.size) > 100_000_000 || files.length >= 5000) fail('BUILD_TOO_LARGE', 'Automatic publication supports up to 5,000 source files, 10 MB per file, and 100 MB total. Remove generated output or large assets and retry.');
      const data = await readFile(path);
      if (hasCredential(data)) fail('SECRET_IN_BUILD', `A possible credential was detected in ${display}. Remove it from the generated source before publishing.`);
      files.push({ name: display, data, mode: info.mode & 0o111 ? 0o755 : 0o644 });
    }
  };
  await visit(directory);
  if (!hasImplementation(files.map(file => file.name))) fail('NO_IMPLEMENTATION', 'No product implementation was found. Handoff documents and tests alone cannot be published as a completed app.');
  return { files, digest: digestFiles(files) };
}

export function validateVerificationCommand(command: string[]): void {
  const [program, ...args] = command;
  if (!/^(?:node|npm|pnpm|yarn|bun|python|python3|pytest|go|cargo|swift|dotnet)$/.test(program ?? '')) fail('UNSAFE_VERIFICATION_COMMAND', 'Use a supported local runtime or package test/build command; shell, GitHub, Git, and network commands are not verification checks.');
  if (args.some(arg => /[\x00-\x1f]/.test(arg) || /(?:^|[=:/\\])\.\.(?:[/\\]|$)/.test(arg) || isAbsolute(arg) || /=[/\\~]|^[A-Za-z]:[\\/]/.test(arg) || /^(?:~|https?:|file:|--(?:eval|print|require|import|loader|experimental-loader)|-[ecrp]$|-C)/.test(arg))) fail('UNSAFE_VERIFICATION_COMMAND', 'Verification commands must use local relative files without inline code, loaders, or paths outside the build directory.');
  const script = /^(?:test|test:[\w-]+|check|check:[\w-]+|build|build:[\w-]+|lint|lint:[\w-]+|typecheck|type-check|smoke|smoke:[\w-]+)$/;
  let valid = false;
  if (['npm', 'pnpm', 'yarn', 'bun'].includes(program)) valid = ((args[0] === 'run' && script.test(args[1] ?? '')) || script.test(args[0] ?? '')) && !args.some(arg => /^--(?:prefix|cwd|dir|directory|global|userconfig|registry)(?:=|$)/.test(arg));
  if (program === 'node') valid = args.includes('--test') || /\.(?:[cm]?js|ts)$/.test(args.find(arg => !arg.startsWith('-')) ?? '');
  if (program === 'python' || program === 'python3') valid = (args[0] === '-m' && ['pytest', 'unittest', 'compileall'].includes(args[1])) || /\.py$/.test(args[0] ?? '');
  if (program === 'pytest') valid = !args.some(arg => arg.startsWith('--rootdir') || arg.startsWith('--confcutdir'));
  if (program === 'go') valid = ['test', 'build', 'vet'].includes(args[0]);
  if (program === 'cargo') valid = ['test', 'build', 'check', 'clippy', 'fmt'].includes(args[0]);
  if (program === 'swift') valid = ['test', 'build'].includes(args[0]);
  if (program === 'dotnet') valid = ['test', 'build', 'format'].includes(args[0]);
  if (!valid) fail('UNSAFE_VERIFICATION_COMMAND', `The ${program} command is not a supported verification command. Record a test, smoke, build, lint, or typecheck command.`);
}

function checkEnvironment(directory: string, nodeEnv: 'test' | 'production' = 'test'): NodeJS.ProcessEnv {
  return { PATH: [join(process.execPath, '..'), ...(process.env.PATH ?? '').split(delimiter).filter(isAbsolute), '/usr/bin', '/bin'].join(delimiter), HOME: directory, USERPROFILE: directory, TMPDIR: directory, XDG_CONFIG_HOME: join(directory, 'config'), XDG_CACHE_HOME: join(directory, 'cache'), npm_config_cache: join(directory, 'npm-cache'), npm_config_userconfig: join(directory, 'empty-npmrc'), NODE_ENV: nodeEnv, CI: '1', NO_COLOR: '1', LANG: 'en_US.UTF-8', TZ: 'UTC', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' };
}

export async function verifyFounderImplementation(directory: string, options: CommonOptions = {}): Promise<FounderVerification> {
  const root = await realpath(directory);
  const reportPath = join(root, '.whatloom', 'verification.json');
  let manifest: VerificationManifest;
  try {
    if (relative(root, await realpath(reportPath)).startsWith('..')) throw new Error('Report escaped workspace');
    if (!(await lstat(reportPath)).isFile() || (await lstat(reportPath)).size > 64_000) throw new Error('Invalid report');
    manifest = verificationManifestSchema.parse(JSON.parse(await readFile(reportPath, 'utf8')));
    const testingPath = join(root, 'TESTING.md'); const testing = await lstat(testingPath);
    if (!testing.isFile() || testing.size < 80 || testing.size > 200_000) throw new Error('Missing evidence');
  } catch { fail('VERIFICATION_REQUIRED', 'The builder must complete TESTING.md and .whatloom/verification.json with real, repeatable tests covering an approved user journey before publication.'); }
  const before = await screenFiles(root);
  for (const check of manifest.checks) validateVerificationCommand(check.command);
  const isolation = await mkdtemp(join(tmpdir(), 'whatloom-check-')); const checks: FounderVerification['checks'] = [];
  try {
    for (const check of manifest.checks) {
      if (options.signal?.aborted) throw new AgentError('CANCELLED', 'Verification was cancelled.', 499);
      const executable = await (options.discover ?? findTool)(check.command[0]);
      if (!executable) fail('VERIFICATION_TOOL_MISSING', `Install ${check.command[0]} locally to run “${check.name}”, then retry verification.`);
      options.onLog?.(`Checking: ${check.name} (${check.kind}).`); const started = Date.now();
      const result = await (options.execute ?? executeBuildCheck)(executable, check.command.slice(1), { cwd: root, env: checkEnvironment(isolation, check.kind === 'build' ? 'production' : 'test'), signal: options.signal, timeoutMs: 300_000, maxOutputBytes: 1_000_000 });
      if (result.exitCode !== 0) { options.onLog?.(redact(`${result.stdout}\n${result.stderr}`)); fail('VERIFICATION_FAILED', `“${check.name}” failed${result.exitCode === null ? '' : ` with exit code ${result.exitCode}`}. Fix the generated app and retry; nothing has been published.`); }
      checks.push({ ...check, command: [...check.command], covers: [...check.covers], exitCode: 0, durationMs: Date.now() - started });
      options.onLog?.(`Passed: ${check.name}.`);
    }
  } finally { await rm(isolation, { recursive: true, force: true }); }
  const after = await screenFiles(root);
  if (before.digest !== after.digest) fail('BUILD_CHANGED_DURING_VERIFICATION', 'Source files changed during verification. Finish generating files, then rerun the checks before publishing.');
  return { passed: true, summary: manifest.summary, checks, limitations: manifest.limitations, verifiedAt: new Date().toISOString(), filesDigest: after.digest, fileCount: after.files.length };
}

interface Receipt {
  version: 2; workspace: string; target: GitHubPublishTarget; digest: string; snapshotDigest: string; commit: string;
  phase: 'prepared' | 'creating' | 'created' | 'published'; remoteId?: string; url?: string; publishedAt?: string;
}
const inFlight = new Set<string>();
function publicationStateRoot(): string {
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'Whatloom', 'publications');
  if (process.platform === 'win32') { const base = process.env.LOCALAPPDATA; return join(base && isAbsolute(base) ? base : join(homedir(), 'AppData', 'Local'), 'Whatloom', 'publications'); }
  const base = process.env.XDG_STATE_HOME; return join(base && isAbsolute(base) ? base : join(homedir(), '.local', 'state'), 'whatloom', 'publications');
}
export async function publishFounderImplementation(directory: string, targetValue: GitHubPublishTarget, options: PublicationOptions): Promise<FounderPublication> {
  const target = githubPublishTargetSchema.parse(targetValue); const root = await realpath(directory);
  const key = createHash('sha256').update(`${root}\0${JSON.stringify(target)}`).digest('hex');
  if (inFlight.has(key)) fail('PUBLISH_BUSY', 'This app is already being published. Wait for its current attempt.');
  inFlight.add(key);
  try {
    if (!options.verification?.passed || !/^[a-f0-9]{64}$/.test(options.verification.filesDigest) || !options.verification.checks?.some(check => ['test', 'smoke'].includes(check.kind) && check.exitCode === 0 && check.covers.length)) fail('VERIFICATION_REQUIRED', 'Complete the independent checks before publishing.');
    const files = await screenFiles(root);
    if (files.digest !== options.verification.filesDigest) fail('BUILD_CHANGED_AFTER_VERIFICATION', 'Generated files changed after verification. Run the checks again before publishing.');
    const identity = await (options.assertOwner ?? assertGitHubOwner)(target.owner, target.account);
    if (identity.account.login.toLowerCase() !== target.account.toLowerCase() || identity.owner.login.toLowerCase() !== target.owner.toLowerCase()) fail('GITHUB_ACCOUNT_CHANGED', 'Reconnect the selected GitHub account and retry.');
    const stateRoot = options.stateRoot ?? publicationStateRoot();
    await mkdir(stateRoot, { recursive: true, mode: 0o700 });
    const state = join(await realpath(stateRoot), key); await mkdir(state, { recursive: true, mode: 0o700 });
    const receiptPath = join(state, 'receipt.json'); const stage = join(state, 'source');
    let receipt: Receipt | undefined;
    try { receipt = JSON.parse(await readFile(receiptPath, 'utf8')) as Receipt; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') fail('PUBLISH_STATE_INVALID', 'Publication recovery data could not be read. The generated app has been kept locally.'); }
    if (receipt && (receipt.version !== 2 || receipt.workspace !== root || JSON.stringify(receipt.target) !== JSON.stringify(target) || receipt.digest !== files.digest || !/^[a-f0-9]{64}$/.test(receipt.snapshotDigest) || !/^[a-f0-9]{40}$/.test(receipt.commit))) fail('PUBLISH_STATE_CHANGED', 'This repository reservation belongs to a different source snapshot. Use a new repository name or restore and verify the original snapshot.');
    const save = async () => { const pending = `${receiptPath}.pending`; await writeFile(pending, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 }); await rename(pending, receiptPath); };
    const execute = options.execute ?? executeBuildCheck; const git = await (options.discover ?? findTool)('git');
    if (!git) fail('GIT_NOT_INSTALLED', 'Install Git locally, then retry publication.');
    const gitArgs = ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgSign=false', '-c', 'core.autocrlf=false', '-c', 'core.attributesFile=/dev/null'];
    const localGit = async (args: string[]) => {
      const result = await execute(git, [...gitArgs, ...args], { cwd: stage, env: { ...checkEnvironment(state), GIT_AUTHOR_NAME: target.account, GIT_AUTHOR_EMAIL: `${target.account}@users.noreply.github.com`, GIT_COMMITTER_NAME: target.account, GIT_COMMITTER_EMAIL: `${target.account}@users.noreply.github.com` }, signal: options.signal, timeoutMs: 120_000, maxOutputBytes: 200_000 });
      if (result.exitCode !== 0) fail('LOCAL_COMMIT_FAILED', 'The local source snapshot could not be committed. Your generated files have been kept.'); return result;
    };
    if (!receipt) {
      await rm(stage, { recursive: true, force: true }); await mkdir(stage, { mode: 0o700 });
      for (const file of files.files) { const destination = resolve(stage, file.name); if (relative(stage, destination).startsWith('..')) fail('UNSAFE_BUILD_FILE', 'A generated filename escaped the export directory.'); await mkdir(join(destination, '..'), { recursive: true }); await writeFile(destination, file.data, { mode: file.mode, flag: 'wx' }); }
      await localGit(['init', '--initial-branch=main', '--template=']);
      await localGit(['add', '--', '.']);
      const tree = (await localGit(['write-tree'])).stdout.trim();
      const snapshotDigest = checkedTreeDigest((await localGit(['ls-tree', '-r', '-z', tree])).stdout, files.files);
      await localGit(['commit', '-m', 'Build the approved product and verify its core journeys']);
      const commit = (await localGit(['rev-parse', 'HEAD'])).stdout.trim();
      if (!/^[a-f0-9]{40}$/.test(commit)) fail('LOCAL_COMMIT_FAILED', 'Git did not return a valid source commit.');
      receipt = { version: 2, workspace: root, target, digest: files.digest, snapshotDigest, commit, phase: 'prepared' }; await save();
    }
    if (checkedTreeDigest((await localGit(['ls-tree', '-r', '-z', receipt.commit])).stdout, files.files) !== receipt.snapshotDigest) fail('PUBLICATION_SNAPSHOT_CHANGED', 'The saved publication snapshot changed. Verify the app again before publishing.');
    const github = options.github ?? runGitHub; const githubGit = options.githubGit ?? runGitHubGit;
    const fullName = `${target.owner}/${target.repository}`; const remoteUrl = `https://github.com/${fullName}.git`;
    const fetchRepo = async () => {
      const result = await github(['api', `repos/${fullName}`], state, options.signal, target.account);
      if (result.exitCode !== 0) return { result, repo: null };
      try { return { result, repo: JSON.parse(result.stdout) as { id: number | string; full_name: string; html_url: string; private: boolean } }; } catch { fail('GITHUB_RESPONSE_INVALID', 'GitHub returned an unreadable repository response. Retry publication.'); }
    };
    if (receipt.phase === 'prepared') {
      const existing = await fetchRepo();
      if (existing.repo) fail('GITHUB_REPOSITORY_EXISTS', 'That repository already exists. Choose a new name; Whatloom never overwrites an existing repository.');
      if (!/(?:HTTP\s+404|"status"\s*:\s*"?404)/i.test(`${existing.result.stdout}\n${existing.result.stderr}`)) githubFailure(existing.result, 'GITHUB_LOOKUP_FAILED', 'GitHub could not confirm that this repository name is available. Check your connection and retry.');
      receipt.phase = 'creating'; await save();
      if (options.signal?.aborted) { receipt.phase = 'prepared'; await save(); throw new AgentError('CANCELLED', 'Publication was cancelled before repository creation.', 499); }
      const endpoint = identity.owner.type === 'Organization' ? `orgs/${target.owner}/repos` : 'user/repos';
      options.onLog?.(`Creating ${target.visibility} repository ${fullName}.`);
      const created = await github(['api', '--method', 'POST', endpoint, '-f', `name=${target.repository}`, '-F', `private=${target.visibility === 'private'}`, '-F', 'auto_init=false', '-f', 'description=Created with Whatloom after local verification'], state, options.signal, target.account);
      if (created.exitCode !== 0) {
        // A clear rejection did not create a repository; a network interruption
        // is ambiguous and must never authorize adopting an unrelated repo.
        if (/HTTP (?:400|401|403|404|409|422)\b/.test(created.stderr)) { receipt.phase = 'prepared'; await save(); }
        githubFailure(created, 'GITHUB_CREATE_FAILED', 'GitHub could not create the selected repository. Check account or organization permissions and name availability. Your local app and commit are safe.');
      }
      let repo: { id: number | string; full_name: string; html_url: string; private: boolean };
      try { repo = JSON.parse(created.stdout); } catch { fail('GITHUB_CREATE_UNCERTAIN', 'GitHub may have created the repository, but its identity could not be recorded. Check GitHub before choosing a new name. No existing repository will be adopted automatically.'); }
      if (!repo.id || repo.full_name.toLowerCase() !== fullName.toLowerCase() || repo.private !== (target.visibility === 'private')) fail('GITHUB_CREATE_UNCERTAIN', 'The created repository did not match the requested owner, name, or visibility. Publication stopped before pushing.');
      receipt.remoteId = String(repo.id); receipt.url = `https://github.com/${repo.full_name}`; receipt.phase = 'created'; await save();
    }
    if (receipt.phase === 'creating') fail('GITHUB_CREATE_UNCERTAIN', 'A previous creation attempt ended before its repository identity was recorded. Check GitHub and choose another name; Whatloom will not take over an existing repository.');
    const currentResult = await fetchRepo(); const current = currentResult.repo;
    if (!current && currentResult.result.exitCode !== 0) githubFailure(currentResult.result, 'GITHUB_REMOTE_UNAVAILABLE', 'The created repository could not be read. Check your connection and retry publication.');
    if (!current || String(current.id) !== receipt.remoteId || current.full_name.toLowerCase() !== fullName.toLowerCase() || current.private !== (target.visibility === 'private')) fail('GITHUB_REPOSITORY_CHANGED', 'The repository identity or visibility changed. Publication stopped to protect existing work.');
    const refs = await githubGit(['ls-remote', remoteUrl], stage, options.signal, target.account);
    if (refs.exitCode !== 0) githubFailure(refs, 'GITHUB_REMOTE_UNAVAILABLE', 'The new repository could not be read. Check organization access and retry.');
    const entries = refs.stdout.trim().split('\n').filter(Boolean).map(line => line.split(/\s+/));
    if (entries.some(([sha, ref]) => sha !== receipt!.commit || !['HEAD', 'refs/heads/main'].includes(ref))) fail('GITHUB_REPOSITORY_CHANGED', 'The repository contains work outside this verified snapshot. Whatloom will not overwrite it.');
    if (!entries.some(([, ref]) => ref === 'refs/heads/main')) {
      options.onLog?.(`Pushing verified commit to ${fullName}.`);
      const pushed = await githubGit(['push', '--porcelain', remoteUrl, `${receipt.commit}:refs/heads/main`], stage, options.signal, target.account);
      if (pushed.exitCode !== 0) githubFailure(pushed, 'GITHUB_PUSH_FAILED', 'The repository was created, but its verified commit could not be pushed. Retry publication to resume the same repository safely.');
    }
    const confirmed = await githubGit(['ls-remote', remoteUrl, 'refs/heads/main'], stage, options.signal, target.account);
    if (confirmed.exitCode !== 0 || confirmed.stdout.trim() !== `${receipt.commit}\trefs/heads/main`) fail('GITHUB_PUSH_UNCONFIRMED', 'GitHub has not confirmed the verified commit on main. Retry publication to check or resume the same repository safely.');
    receipt.phase = 'published'; receipt.publishedAt ??= new Date().toISOString(); await save();
    return { ...target, url: receipt.url!, commit: receipt.commit, publishedAt: receipt.publishedAt };
  } finally { inFlight.delete(key); }
}
