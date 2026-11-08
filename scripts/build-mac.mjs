import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, chmod, copyFile, cp, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const run = promisify(execFile);
const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = join(projectDirectory, 'outputs');

export function normalizeNodeVersion(value) {
  const version = value.startsWith('v') ? value : `v${value}`;
  if (!/^v22\.\d+\.\d+$/.test(version)) throw new Error('WHATLOOM_NODE_VERSION must name an exact Node 22 release, such as 22.23.4.');
  return version;
}

export function runtimeArchiveName(version, architecture) {
  if (!['arm64', 'x64'].includes(architecture)) throw new Error('Only arm64 and x64 Mac builds are supported.');
  return `node-${normalizeNodeVersion(version)}-darwin-${architecture}.tar.gz`;
}

export function checksumForArchive(checksums, archive) {
  const entry = checksums.split(/\r?\n/).map((line) => line.trim().split(/\s+/)).find((parts) => parts[1]?.replace(/^\*/, '') === archive);
  if (!entry || !/^[a-f\d]{64}$/i.test(entry[0])) throw new Error(`The official checksum list does not contain ${archive}.`);
  return entry[0].toLowerCase();
}

export function artifactNames(version, architecture) {
  if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z\d.-]+)?$/.test(version)) throw new Error('The package needs a valid release version.');
  const base = `Whatloom-${version}-macOS-${architecture}`;
  return { zip: `${base}.zip`, dmg: `${base}.dmg`, checksums: `${base}-SHA256SUMS.txt` };
}

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Official runtime metadata could not be downloaded (${response.status}).`);
  const text = await response.text();
  if (text.length > 3_000_000) throw new Error('The runtime metadata response was unexpectedly large.');
  return text;
}

async function officialRuntime(architecture) {
  let version;
  if (process.env.WHATLOOM_NODE_VERSION) version = normalizeNodeVersion(process.env.WHATLOOM_NODE_VERSION);
  else {
    const releases = JSON.parse(await fetchText('https://nodejs.org/dist/index.json'));
    const latest = releases.find((release) => /^v22\.\d+\.\d+$/.test(release.version));
    if (!latest) throw new Error('No current Node 22 release was found in the official release index.');
    version = normalizeNodeVersion(latest.version);
  }
  const archiveName = runtimeArchiveName(version, architecture);
  const releaseURL = `https://nodejs.org/dist/${version}`;
  const checksumText = await fetchText(`${releaseURL}/SHASUMS256.txt`);
  const expectedHash = checksumForArchive(checksumText, archiveName);
  const cache = join(outputDirectory, 'runtime');
  await mkdir(cache, { recursive: true });
  const archive = join(cache, archiveName);
  if (!(await exists(archive)) || await sha256(archive) !== expectedHash) {
    const partial = `${archive}.partial-${process.pid}`;
    console.log(`Downloading the official ${version} darwin-${architecture} runtime…`);
    try {
      const response = await fetch(`${releaseURL}/${archiveName}`, { signal: AbortSignal.timeout(180_000) });
      if (!response.ok || !response.body) throw new Error(`Runtime download failed (${response.status}).`);
      const bytes = Number(response.headers.get('content-length') || 0);
      if (bytes > 150_000_000) throw new Error('The runtime archive was unexpectedly large.');
      await pipeline(Readable.fromWeb(response.body), createWriteStream(partial, { mode: 0o600 }));
      if (await sha256(partial) !== expectedHash) throw new Error('The downloaded runtime does not match its official SHA256 checksum.');
      await copyFile(partial, archive);
    } finally { await rm(partial, { force: true }); }
  }
  await writeFile(join(cache, `SHASUMS256-${version}.txt`), checksumText);
  const root = join(cache, archiveName.replace(/\.tar\.gz$/, ''));
  // Extract again from the verified archive so the cached executable cannot drift.
  await rm(root, { recursive: true, force: true });
  await run('/usr/bin/tar', ['-xzf', archive, '-C', cache]);
  const executable = join(root, 'bin', 'node');
  const observed = (await run(executable, ['--version'])).stdout.trim();
  const observedArchitecture = (await run(executable, ['-p', 'process.arch'])).stdout.trim();
  if (observed !== version || observedArchitecture !== architecture) throw new Error('The runtime version or architecture does not match the verified archive.');
  if (!(await exists(join(root, 'LICENSE')))) throw new Error('The official runtime archive is missing its full LICENSE.');
  return { root, executable, version, archiveName, archiveSHA256: expectedHash, releaseURL };
}

function escapeXML(value) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
}

export function infoPlist(version) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleDevelopmentRegion</key><string>en</string>
<key>CFBundleDisplayName</key><string>Whatloom</string>
<key>CFBundleName</key><string>Whatloom</string>
<key>CFBundleExecutable</key><string>Whatloom</string>
<key>CFBundleIdentifier</key><string>app.whatloom.desktop</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>${escapeXML(version)}</string>
<key>CFBundleVersion</key><string>${escapeXML(version.split('-')[0])}</string>
<key>CFBundleIconFile</key><string>Whatloom.icns</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>LSApplicationCategoryType</key><string>public.app-category.productivity</string>
<key>NSHighResolutionCapable</key><true/>
<key>NSSupportsAutomaticGraphicsSwitching</key><true/>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict></plist>\n`;
}

async function preserveDependencyNotices(serverDirectory) {
  const notices = [];
  const visited = new Set();
  async function inspectPackage(packageDirectory) {
    const relativeDirectory = relative(serverDirectory, packageDirectory);
    const source = join(projectDirectory, relativeDirectory);
    const sourceManifest = join(source, 'package.json');
    let metadata;
    try { metadata = JSON.parse(await readFile(sourceManifest, 'utf8')); } catch { return; }
    const packageName = typeof metadata.name === 'string' ? metadata.name : basename(packageDirectory);
    const packageVersion = typeof metadata.version === 'string' ? metadata.version : 'vendored; version not supplied in package metadata';
    const identity = `${packageName}@${packageVersion}:${relativeDirectory}`;
    if (visited.has(identity)) return;
    visited.add(identity);
    await copyFile(sourceManifest, join(packageDirectory, 'package.json'));
    const copied = [];
    for (const entry of await readdir(source, { withFileTypes: true })) {
      if (/^(?:licen[cs]e|copying|notice|authors|readme|third[-_]?party[-_]?notices?)(?:$|[._-])/i.test(entry.name) ||
          (entry.isDirectory() && /^(?:licenses|licences|copyright|third_party_licenses)$/i.test(entry.name))) {
        await cp(join(source, entry.name), join(packageDirectory, entry.name), { recursive: true });
        copied.push(entry.name);
      }
    }
    for (const licenseDirectory of ['share/licenses', 'share/doc', 'lib/glib-2.0/include']) {
      if (await exists(join(source, licenseDirectory))) {
        await cp(join(source, licenseDirectory), join(packageDirectory, licenseDirectory), { recursive: true });
        copied.push(licenseDirectory);
      }
    }
    notices.push({ name: packageName, version: packageVersion, license: metadata.license ?? metadata.licenses ?? 'Not specified in package metadata', repository: metadata.repository ?? null, packageDirectory: relativeDirectory, preservedDocuments: copied });
  }
  async function visitNodeModules(nodeModules) {
    if (!(await exists(nodeModules))) return;
    for (const entry of await readdir(nodeModules, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const candidate = join(nodeModules, entry.name);
      const packages = entry.name.startsWith('@')
        ? (await readdir(candidate, { withFileTypes: true })).filter((item) => item.isDirectory() || item.isSymbolicLink()).map((item) => join(candidate, item.name))
        : [candidate];
      for (const packageDirectory of packages) {
        if (!(await stat(packageDirectory)).isDirectory()) continue;
        await inspectPackage(packageDirectory);
        await visitNodeModules(join(packageDirectory, 'node_modules'));
        // Next vendors some dependencies under dist/compiled with their own licenses.
        const compiled = join(packageDirectory, 'dist', 'compiled');
        if (await exists(compiled)) {
          for (const child of await readdir(compiled, { withFileTypes: true })) {
            if (child.isDirectory()) await inspectPackage(join(compiled, child.name));
          }
        }
      }
    }
  }
  await visitNodeModules(join(serverDirectory, 'node_modules'));
  notices.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
  return notices;
}

async function verifyBundleLinks(directory) {
  const root = await realpath(directory);
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isSymbolicLink()) {
        const target = await realpath(path);
        const linkRelative = relative(root, target);
        if (linkRelative.startsWith('..') || isAbsolute(linkRelative)) throw new Error(`A bundled dependency links outside the app: ${relative(root, path)}`);
      } else if (entry.isDirectory()) await visit(path);
    }
  }
  await visit(root);
}

export async function buildMac({ skipWebBuild = false } = {}) {
  if (process.platform !== 'darwin') throw new Error('Build the native macOS app on a Mac with Xcode command line tools.');
  const architecture = process.arch;
  if (!['arm64', 'x64'].includes(architecture)) throw new Error('An arm64 or x64 Mac build host is required.');
  const packageData = JSON.parse(await readFile(join(projectDirectory, 'package.json'), 'utf8'));
  const names = artifactNames(packageData.version, architecture);
  if (!skipWebBuild) {
    console.log('Building the Next.js standalone production server…');
    await run(process.execPath, [join(projectDirectory, 'node_modules/next/dist/bin/next'), 'build'], { cwd: projectDirectory, maxBuffer: 20_000_000, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
  }
  const standalone = join(projectDirectory, '.next', 'standalone');
  if (!(await exists(join(standalone, 'server.js')))) throw new Error('A standalone server is missing. Set output: "standalone" in the local Next config and run the production build.');
  console.log('Preparing the official checksum-verified Node runtime…');
  const runtime = await officialRuntime(architecture);
  await mkdir(outputDirectory, { recursive: true });
  const app = join(outputDirectory, 'Whatloom.app');
  await rm(app, { recursive: true, force: true });
  const contents = join(app, 'Contents');
  const resources = join(contents, 'Resources');
  const serverDirectory = join(resources, 'server');
  await mkdir(join(contents, 'MacOS'), { recursive: true });
  await mkdir(join(resources, 'runtime'), { recursive: true });
  await cp(standalone, serverDirectory, { recursive: true });
  await cp(join(projectDirectory, '.next', 'static'), join(serverDirectory, '.next', 'static'), { recursive: true });
  await cp(join(projectDirectory, 'public'), join(serverDirectory, 'public'), { recursive: true });
  await copyFile(runtime.executable, join(resources, 'runtime', 'node'));
  await chmod(join(resources, 'runtime', 'node'), 0o755);
  await copyFile(join(runtime.root, 'LICENSE'), join(resources, 'runtime', 'LICENSE'));
  await copyFile(join(projectDirectory, 'public/brand/app-icon.icns'), join(resources, 'Whatloom.icns'));
  await writeFile(join(contents, 'Info.plist'), infoPlist(packageData.version));
  const notices = await preserveDependencyNotices(serverDirectory);
  await writeFile(join(resources, 'ThirdPartyNotices.json'), JSON.stringify(notices, null, 2) + '\n');
  await writeFile(join(resources, 'ThirdPartyNotices.txt'), `Whatloom third-party packages\n\nNode.js ${runtime.version}: complete Node and bundled-dependency license text is in runtime/LICENSE.\n\n` + notices.map((item) => `${item.name} ${item.version}\nLicense: ${typeof item.license === 'string' ? item.license : JSON.stringify(item.license)}\nLocation: ${item.packageDirectory}\nPreserved documents: ${item.preservedDocuments.join(', ') || 'No separate notice supplied in the installed package'}\n`).join('\n'));
  await copyFile(join(projectDirectory, 'desktop', 'RELEASE-NOTES.md'), join(resources, 'RELEASE-NOTES.md'));
  const buildId = (await readFile(join(serverDirectory, '.next', 'BUILD_ID'), 'utf8')).trim();
  let commit = null;
  try { commit = (await run('/usr/bin/git', ['rev-parse', 'HEAD'], { cwd: projectDirectory })).stdout.trim(); } catch { /* A source archive may not contain Git metadata. */ }
  const manifest = { name: 'Whatloom', version: packageData.version, architecture, minimumMacOS: '13.0', builtAt: new Date().toISOString(), sourceCommit: commit, webBuildId: buildId, node: { version: runtime.version, archive: runtime.archiveName, archiveSHA256: runtime.archiveSHA256, releaseURL: runtime.releaseURL, binarySHA256: await sha256(join(resources, 'runtime', 'node')) }, signing: 'ad-hoc', notarized: false, thirdPartyPackageCount: notices.length };
  await writeFile(join(resources, 'BuildManifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  await verifyBundleLinks(resources);
  console.log('Compiling the native macOS shell…');
  const target = `${architecture === 'x64' ? 'x86_64' : 'arm64'}-apple-macosx13.0`;
  await run('/usr/bin/xcrun', ['swiftc', '-swift-version', '5', '-O', '-target', target, '-framework', 'AppKit', '-framework', 'WebKit', join(projectDirectory, 'desktop/Whatloom.swift'), '-o', join(contents, 'MacOS', 'Whatloom')], { maxBuffer: 10_000_000 });
  await run('/usr/bin/plutil', ['-lint', join(contents, 'Info.plist')]);
  await run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', app]);
  await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
  console.log('Creating the installable ZIP and DMG…');
  const zip = join(outputDirectory, names.zip);
  const dmg = join(outputDirectory, names.dmg);
  await rm(zip, { force: true });
  await run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, zip]);
  const staging = join(outputDirectory, `.dmg-stage-${process.pid}`);
  await rm(staging, { recursive: true, force: true });
  try {
    await mkdir(staging);
    await cp(app, join(staging, 'Whatloom.app'), { recursive: true });
    await run('/bin/ln', ['-s', '/Applications', join(staging, 'Applications')]);
    await run('/usr/bin/hdiutil', ['create', '-volname', 'Whatloom', '-srcfolder', staging, '-ov', '-format', 'UDZO', dmg], { maxBuffer: 10_000_000 });
  } finally { await rm(staging, { recursive: true, force: true }); }
  await writeFile(join(outputDirectory, names.checksums), `${await sha256(zip)}  ${names.zip}\n${await sha256(dmg)}  ${names.dmg}\n`);
  console.log(JSON.stringify({ app, zip, dmg, checksums: join(outputDirectory, names.checksums), runtime: runtime.version, packages: notices.length, signing: 'ad-hoc, not notarized' }, null, 2));
  return { app, zip, dmg, manifest, notices };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const unknown = process.argv.slice(2).filter((argument) => argument !== '--skip-web-build');
  if (unknown.length) { console.error(`Unknown build option: ${unknown.join(', ')}`); process.exitCode = 1; }
  else buildMac({ skipWebBuild: process.argv.includes('--skip-web-build') }).catch((error) => { console.error(`Mac build failed: ${error.message}`); process.exitCode = 1; });
}
