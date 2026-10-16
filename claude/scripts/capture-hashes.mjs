// Record SHA-256 hashes of the original Cursor application files on macOS so
// build-*.json can be refreshed for the exact installed build.
// Run on a Mac with an unmodified Cursor installation and macOS 26+:
//   node scripts/capture-hashes.mjs "/Applications/Cursor.app/Contents/Resources/app"
// Copy the printed object into the matching build-<version>-darwin-arm64.json file,
// keeping platform "darwin", arch "arm64" and osMinimum "26.0".
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {assertSupportedMac, verifyMacSignature} from '../macos.mjs';

const root = process.argv[2];
if (!root) throw new Error('Usage: node scripts/capture-hashes.mjs PATH_TO_ORIGINAL_RESOURCES_APP');
const files = [
  'out/vs/workbench/workbench.desktop.main.js',
  'out/vs/workbench/workbench.glass.main.js',
  'extensions/cursor-agent-exec/dist/main.js',
  'extensions/cursor-local-agent-runtime/dist/main.js',
  'out/main.js',
  'product.json'
];
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const product = JSON.parse(fs.readFileSync(path.join(root, 'product.json'), 'utf8'));
const hashes = {};
for (const relative of files) {
  const full = path.join(root, relative);
  if (!fs.existsSync(full)) throw new Error('Missing required Cursor file: ' + relative);
  hashes[relative] = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
}
assertSupportedMac({platform:'darwin', arch:'arm64', osMinimum:'26.0'});
verifyMacSignature(root);
console.log(JSON.stringify({version:pkg.version, commit:product.commit,
  platform:'darwin', arch:'arm64', osMinimum:'26.0', files:hashes}, null, 2));
