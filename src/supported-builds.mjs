import fs from 'node:fs';
import path from 'node:path';

// Builds up to 3.22.12 have hand-ported patch definitions and are listed here.
// From 3.24.12 a build is supported when its reviewed files exist: the hashes
// in supported-build-<version>.json and the symbols in symbols-<version>.json.
const legacyBuilds = ['3.20.7','3.20.11','3.20.17','3.20.21','3.20.23','3.21.1','3.21.9','3.21.12','3.21.13','3.21.16','3.21.18','3.22.5','3.22.9','3.22.12'];

export function isSupportedVersion(version) {
  return legacyBuilds.includes(version) ||
    (fs.existsSync(new URL('supported-build-' + version + '.json', import.meta.url)) &&
     fs.existsSync(new URL('symbols-' + version + '.json', import.meta.url)));
}

export function symbolsFor(version) {
  const file = new URL('symbols-' + version + '.json', import.meta.url);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined;
}

export function supportedBuild(root) {
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  if (!isSupportedVersion(version)) throw new Error('Unsupported Cursor version: ' + version);
  const darwinFile = 'supported-build-' + version + '-darwin.json';
  const file = process.platform === 'darwin' && fs.existsSync(new URL(darwinFile, import.meta.url))
    ? darwinFile : version === '3.20.7' ? 'supported-build.json' : 'supported-build-' + version + '.json';
  const build = JSON.parse(fs.readFileSync(new URL(file, import.meta.url), 'utf8'));
  const product = JSON.parse(fs.readFileSync(path.join(root, 'product.json'), 'utf8'));
  if (product.commit !== build.commit) throw new Error('Unsupported Cursor commit.');
  return build;
}
