import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = 4310;
const address = `http://127.0.0.1:${port}`;
const environment = { ...process.env, PATH: `${dirname(process.execPath)}:${process.env.PATH || ''}` };

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

async function isWhatloomRunning() {
  try {
    const response = await fetch(`${address}/api/health`, { signal: AbortSignal.timeout(1200) });
    const body = await response.json();
    return response.ok && body.app === 'whatloom' && body.version === 1;
  } catch { return false; }
}

function openBrowser() {
  const opener = spawn('open', [address], { stdio: 'ignore', env: environment, shell: false });
  opener.on('error', () => console.log(`Open ${address} in your browser.`));
}

async function ensurePortAvailable() {
  await new Promise((resolveReady, reject) => {
    const server = createServer();
    server.once('error', () => reject(new Error(`Port ${port} is in use by another app. Stop that app, then start Whatloom again.`)));
    server.listen(port, '127.0.0.1', () => server.close(resolveReady));
  });
}

async function installDependencies() {
  const npmCli = join(dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const command = await exists(npmCli) ? process.execPath : 'npm';
  const args = await exists(npmCli) ? [npmCli, 'install'] : ['install'];
  console.log('Installing Whatloom’s project dependencies. This may take a few minutes.');
  await new Promise((resolveInstall, reject) => {
    const installer = spawn(command, args, { cwd: projectDirectory, env: environment, stdio: 'inherit', shell: false });
    installer.once('error', () => reject(new Error('npm is unavailable. Install Node.js with npm, then try again.')));
    installer.once('exit', (code) => code === 0 ? resolveInstall() : reject(new Error('Dependency installation did not finish. Check the message above, then try again.')));
  });
}

async function main() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 13)) throw new Error('Whatloom needs Node.js 22.13 or newer. Update Node.js, then try again.');
  process.chdir(projectDirectory);
  if (await isWhatloomRunning()) {
    console.log(`Whatloom is already running at ${address}`);
    openBrowser();
    return;
  }
  await ensurePortAvailable();
  const nextCli = join(projectDirectory, 'node_modules', 'next', 'dist', 'bin', 'next');
  if (!(await exists(nextCli))) await installDependencies();
  const hasBuild = await exists(join(projectDirectory, '.next', 'BUILD_ID'));
  console.log(`Starting Whatloom at ${address}`);
  console.log('Keep this Terminal window open. Press Control-C to stop the app.');
  const server = spawn(process.execPath, [nextCli, hasBuild ? 'start' : 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: projectDirectory, env: environment, stdio: 'inherit', shell: false,
  });
  let stopped = false;
  let ready = false;
  const stop = (signal) => {
    if (stopped) return;
    stopped = true;
    server.kill(signal);
  };
  process.once('SIGINT', () => stop('SIGINT'));
  process.once('SIGTERM', () => stop('SIGTERM'));
  server.once('error', () => { console.error('Whatloom could not start. Check Node.js and the project dependencies.'); process.exitCode = 1; stopped = true; });
  server.once('exit', (code) => { stopped = true; process.exitCode = code ?? 0; });
  for (let attempt = 0; attempt < 120 && !stopped; attempt += 1) {
    if (await isWhatloomRunning()) { ready = true; openBrowser(); break; }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  if (!ready && !stopped) console.log(`The app is still starting. Open ${address} when the server says it is ready.`);
}

main().catch((error) => {
  console.error(`\n${error.message}\n`);
  process.exitCode = 1;
});
