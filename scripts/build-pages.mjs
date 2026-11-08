import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = join(root, 'outputs', 'pages');
const basePath = (process.env.WHATLOOM_BASE_PATH ?? process.env.NEXT_PUBLIC_BASE_PATH ?? '/whatloom').replace(/\/$/, '');
const repositoryUrl = (process.env.NEXT_PUBLIC_REPOSITORY_URL || (process.env.GITHUB_REPOSITORY ? `https://github.com/${process.env.GITHUB_REPOSITORY}` : 'https://github.com/npandeya/whatloom')).replace(/\/$/, '');

if (basePath && !/^\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*$/.test(basePath)) {
  throw new Error('WHATLOOM_BASE_PATH must be empty or a path such as /whatloom.');
}
if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repositoryUrl)) {
  throw new Error('NEXT_PUBLIC_REPOSITORY_URL must identify the GitHub repository.');
}

// A separate source tree keeps the local server, standalone build, and native
// package untouched. Only browser code enters this export; API handlers and the
// local agent server are deliberately absent.
const stage = await mkdtemp(join(tmpdir(), 'whatloom-pages-'));
try {
  await Promise.all(['app', 'lib'].map((directory) => mkdir(join(stage, directory), { recursive: true })));
  const files = [
    'app/page.tsx', 'app/layout.tsx', 'app/globals.css',
    'lib/studio.ts', 'lib/studio-types.ts', 'lib/hosting.ts',
    'package.json', 'package-lock.json', 'tsconfig.json',
  ];
  for (const file of files) await cp(join(root, file), join(stage, file));
  await cp(join(root, 'public'), join(stage, 'public'), { recursive: true });
  await symlink(join(root, 'node_modules'), join(stage, 'node_modules'), 'dir');

  // Public CSS and standalone HTML use ordinary URLs rather than next/link.
  const cssPath = join(stage, 'app', 'globals.css');
  const css = await readFile(cssPath, 'utf8');
  await writeFile(cssPath, css.replaceAll("url('/brand/", `url('${basePath}/brand/`).replaceAll('url("/brand/', `url("${basePath}/brand/`));
  const boardPath = join(stage, 'public', 'brand', 'brand-board.html');
  const board = await readFile(boardPath, 'utf8');
  await writeFile(boardPath, board.replaceAll('href="/"', `href="${basePath}/"`));
  const manifestPath = join(stage, 'public', 'manifest.webmanifest');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.start_url = `${basePath}/`;
  manifest.scope = `${basePath}/`;
  manifest.icons = manifest.icons.map((icon) => ({ ...icon, src: `${basePath}${icon.src}` }));
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(stage, 'next.config.mjs'), `export default ${JSON.stringify({
    output: 'export', basePath, trailingSlash: true, devIndicators: false,
    images: { unoptimized: true },
  }, null, 2)};\n`);

  console.log(`Building Whatloom browser studio for ${basePath || '/'} …`);
  await new Promise((resolveBuild, reject) => {
    const build = spawn(process.execPath, [join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'build', '--webpack'], {
      cwd: stage,
      env: {
        ...process.env,
        PATH: `${dirname(process.execPath)}:${process.env.PATH || ''}`,
        NEXT_TELEMETRY_DISABLED: '1',
        NEXT_PUBLIC_HOSTED: 'true',
        NEXT_PUBLIC_BASE_PATH: basePath,
        NEXT_PUBLIC_REPOSITORY_URL: repositoryUrl,
      },
      stdio: 'inherit',
      shell: false,
    });
    build.once('error', reject);
    build.once('exit', (code) => code === 0 ? resolveBuild() : reject(new Error(`Static browser build failed with exit code ${code}.`)));
  });

  const html = await readFile(join(stage, 'out', 'index.html'), 'utf8');
  if (!html.includes(`${basePath}/brand/mark-ink.svg`) || !html.includes(`${basePath}/_next/`)) {
    throw new Error('The exported page does not contain the expected base-path assets.');
  }
  if (!html.includes(`${repositoryUrl}/releases/latest`)) {
    throw new Error('The exported page is missing the Mac download link.');
  }
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(dirname(outputDirectory), { recursive: true });
  await cp(join(stage, 'out'), outputDirectory, { recursive: true });
  await writeFile(join(outputDirectory, '.nojekyll'), '');
  console.log(`Static studio ready: ${outputDirectory}`);
  console.log(`Mac download: ${repositoryUrl}/releases/latest`);
} finally {
  await rm(stage, { recursive: true, force: true });
}
