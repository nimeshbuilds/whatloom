import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = process.argv[2] ? resolve(process.argv[2]) : join(project, 'outputs', 'Whatloom.app');
const resources = join(app, 'Contents', 'Resources');
const runtime = join(resources, 'runtime', 'node');
const serverDirectory = join(resources, 'server');

async function freePort() {
  return new Promise((resolvePort, reject) => {
    const listener = createServer();
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', () => {
      const port = listener.address().port;
      listener.close(() => resolvePort(port));
    });
  });
}

function assert(condition, message) { if (!condition) throw new Error(message); }

async function main() {
  if (process.platform !== 'darwin') throw new Error('Run the Mac bundle check on macOS.');
  await run('/usr/bin/plutil', ['-lint', join(app, 'Contents', 'Info.plist')]);
  await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
  const manifest = JSON.parse(await readFile(join(resources, 'BuildManifest.json'), 'utf8'));
  const runtimeVersion = (await run(runtime, ['--version'])).stdout.trim();
  const runtimeArchitecture = (await run(runtime, ['-p', 'process.arch'])).stdout.trim();
  assert(runtimeVersion === manifest.node.version, 'The bundled Node version does not match the manifest.');
  assert(runtimeArchitecture === manifest.architecture, 'The bundled Node architecture does not match the manifest.');
  assert((await readFile(join(resources, 'runtime', 'LICENSE'), 'utf8')).length > 100_000, 'The complete matching Node license is missing.');
  const actualHash = createHash('sha256').update(await readFile(runtime)).digest('hex');
  assert(actualHash === manifest.node.binarySHA256, 'The bundled Node hash does not match its build manifest.');
  const notices = JSON.parse(await readFile(join(resources, 'ThirdPartyNotices.json'), 'utf8'));
  assert(notices.some((item) => item.name === 'next'), 'Next.js dependency notices are missing.');
  const port = await freePort();
  const address = `http://127.0.0.1:${port}`;
  const child = spawn(runtime, [join(serverDirectory, 'server.js')], {
    cwd: serverDirectory,
    env: { ...process.env, PATH: `${dirname(runtime)}:/usr/bin:/bin`, HOSTNAME: '127.0.0.1', PORT: String(port), NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' },
    stdio: 'ignore', shell: false,
  });
  let stopped = false;
  child.once('exit', () => { stopped = true; });
  const stop = async () => {
    if (stopped) return;
    child.kill('SIGTERM');
    await new Promise((resolveStop) => {
      const timer = setTimeout(() => { if (!stopped) child.kill('SIGKILL'); resolveStop(); }, 2500);
      child.once('exit', () => { clearTimeout(timer); resolveStop(); });
    });
  };
  try {
    let ready = false;
    for (let attempt = 0; attempt < 90; attempt += 1) {
      if (stopped) throw new Error('The bundled standalone server exited before becoming ready.');
      try {
        const response = await fetch(`${address}/api/health`, { signal: AbortSignal.timeout(1000) });
        if (response.ok && (await response.json()).app === 'whatloom') { ready = true; break; }
      } catch { /* The packaged server may still be starting. */ }
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
    assert(ready, 'The bundled standalone server did not become ready.');
    const page = await fetch(address);
    assert(page.ok, 'The bundled home page did not load.');
    const html = await page.text();
    assert(/whatloom/i.test(html), 'The bundled page does not contain the app.');
    const assetPath = html.match(/(?:src|href)="(\/_next\/static\/[^\"]+)"/)?.[1]?.replaceAll('&amp;', '&');
    assert(assetPath, 'The bundled page did not reference a static asset.');
    assert((await fetch(`${address}${assetPath}`)).ok, 'A bundled Next static asset is missing.');
    assert((await fetch(`${address}/brand/app-icon.svg`)).ok, 'Bundled public assets are missing.');
    const agents = await fetch(`${address}/api/agents`);
    assert(agents.ok && Array.isArray((await agents.json()).agents), 'The bundled agent detection API failed.');
    const github = await fetch(`${address}/api/github`);
    assert(github.ok && ['connected', 'disconnected', 'pending', 'unavailable', 'error'].includes((await github.json()).status), 'The bundled GitHub connection API failed.');
    const invalidBuild = await fetch(`${address}/api/build`, { method: 'POST', headers: { Origin: address, 'Content-Type': 'application/json' }, body: '{}' });
    assert(invalidBuild.status === 400, 'The bundled founder build API did not validate its input.');
    const blockedGitHub = await fetch(`${address}/api/github`, { method: 'POST', headers: { Origin: 'https://elsewhere.example', 'Content-Type': 'application/json' }, body: '{"action":"login"}' });
    assert(blockedGitHub.status === 403, 'The bundled GitHub API did not reject an external origin.');
    const invalid = await fetch(`${address}/api/explore`, { method: 'POST', headers: { Origin: address, 'Content-Type': 'application/json' }, body: '{}' });
    assert(invalid.status === 400, 'The packaged API did not accept its local origin for input validation.');
    const blocked = await fetch(`${address}/api/explore`, { method: 'POST', headers: { Origin: 'https://elsewhere.example', 'Content-Type': 'application/json' }, body: '{}' });
    assert(blocked.status === 403, 'The packaged API did not reject an external origin.');
    console.log(JSON.stringify({ app, runtimeVersion, architecture: runtimeArchitecture, port, signature: 'valid ad-hoc', productionServer: 'passed', staticAssets: 'passed', publicAssets: 'passed', agentDetection: 'passed', githubConnection: 'passed', founderBuildValidation: 'passed', originChecks: 'passed', noticePackages: notices.length, modelCalls: 0 }, null, 2));
  } finally { await stop(); }
}

main().catch((error) => { console.error(`Mac bundle check failed: ${error.message}`); process.exitCode = 1; });
