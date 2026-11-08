import assert from 'node:assert/strict';
import test from 'node:test';
import { artifactNames, checksumForArchive, infoPlist, normalizeNodeVersion, runtimeArchiveName } from '../scripts/build-mac.mjs';

test('Mac release artifacts contain the exact app version and target architecture', () => {
  assert.deepEqual(artifactNames('0.1.0', 'arm64'), { zip: 'Whatloom-0.1.0-macOS-arm64.zip', dmg: 'Whatloom-0.1.0-macOS-arm64.dmg', checksums: 'Whatloom-0.1.0-macOS-arm64-SHA256SUMS.txt' });
  assert.throws(() => artifactNames('../bad', 'arm64'));
});

test('runtime downloads require exact official Node 22 archive names and checksums', () => {
  assert.equal(normalizeNodeVersion('22.23.4'), 'v22.23.4');
  assert.equal(runtimeArchiveName('v22.23.4', 'arm64'), 'node-v22.23.4-darwin-arm64.tar.gz');
  assert.throws(() => normalizeNodeVersion('latest'));
  assert.throws(() => normalizeNodeVersion('24.1.0'));
  assert.throws(() => runtimeArchiveName('22.23.4', 'other'));
  const hash = 'a'.repeat(64);
  assert.equal(checksumForArchive(`${'b'.repeat(64)}  other.tar.gz\n${hash}  node-v22.23.4-darwin-arm64.tar.gz\n`, 'node-v22.23.4-darwin-arm64.tar.gz'), hash);
  assert.throws(() => checksumForArchive(`${hash}  other.tar.gz`, 'node-v22.23.4-darwin-arm64.tar.gz'));
  assert.throws(() => checksumForArchive('invalid  node-v22.23.4-darwin-arm64.tar.gz', 'node-v22.23.4-darwin-arm64.tar.gz'));
});

test('native bundle metadata requires the supported minimum Mac version and stable store identity', () => {
  const plist = infoPlist('0.1.0');
  assert.match(plist, /LSMinimumSystemVersion<\/key><string>13\.0<\/string>/);
  assert.match(plist, /CFBundleIdentifier<\/key><string>app\.whatloom\.desktop<\/string>/);
  assert.match(plist, /CFBundleExecutable<\/key><string>Whatloom<\/string>/);
});
