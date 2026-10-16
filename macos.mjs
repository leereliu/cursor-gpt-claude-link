import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const run = (executable, args, options = {}) => execFileSync(executable, args, {stdio:'pipe', timeout:120000, ...options});

export function appBundlePath(root) {
  const bundle = path.resolve(root, '../../..');
  if (!bundle.endsWith('.app') || path.join(bundle, 'Contents/Resources/app') !== path.resolve(root) || !fs.existsSync(bundle)) {
    throw new Error('Expected an installed Cursor.app/Contents/Resources/app directory.');
  }
  return fs.realpathSync(bundle);
}

export function machineArch() {
  if (process.platform !== 'darwin') return process.arch;
  try {
    if (run('/usr/sbin/sysctl', ['-n', 'hw.optional.arm64']).toString().trim() === '1') return 'arm64';
  } catch {}
  return process.arch;
}

export function osMinimumMajor(build) {
  const major = Number(String(build?.osMinimum ?? '').split('.')[0]);
  if (!Number.isInteger(major) || major <= 0) throw new Error('Supported build is missing a valid osMinimum.');
  return major;
}

export function macosMajorVersion() {
  const major = Number(run('/usr/bin/sw_vers', ['-productVersion']).toString().trim().split('.')[0]);
  if (!Number.isInteger(major)) throw new Error('Cannot determine the macOS version.');
  return major;
}

export function assertSupportedMac(build) {
  const minimum = osMinimumMajor(build);
  if (process.platform !== 'darwin' || machineArch() !== 'arm64' || build.platform !== 'darwin' || build.arch !== 'arm64' || macosMajorVersion() < minimum) {
    throw new Error('Only macOS ' + minimum + '+ (Apple Silicon) is supported by this build.');
  }
}

export function signingIdentity(saved) {
  const selected = process.env.CURSOR_MACOS_SIGN_IDENTITY || saved;
  const identity = typeof selected === 'string' ? selected.toUpperCase() : '';
  if (!/^[a-f0-9]{40}$/i.test(identity || '')) {
    throw new Error('Set CURSOR_MACOS_SIGN_IDENTITY to an Apple signing identity SHA-1. Ad-hoc signing does not preserve Cursor library validation.');
  }
  const available = run('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning']).toString();
  if (!available.includes(identity)) throw new Error('The selected Apple signing identity is not available in Keychain.');
  return identity;
}

export function requireClosedCursor() {
  try { run('/usr/bin/pgrep', ['-x', 'Cursor']); }
  catch (error) { if (error.status === 1) return; throw error; }
  throw new Error('Close Cursor before installing or restoring either link.');
}

export function requireWritableApp(root) {
  const app = appBundlePath(root);
  const stat = fs.statSync(app);
  if (stat.uid !== process.getuid()) throw new Error('Cursor.app must be owned by the current user.');
  fs.accessSync(app, fs.constants.W_OK);
  return stat.mode & 0o7777;
}

export function setAppMode(root, mode) {
  // Older manifests did not record permissions; do not guess their prior mode.
  if (mode === undefined) return;
  if (!Number.isInteger(mode) || mode < 0 || mode > 0o7777) throw new Error('Invalid recorded Cursor app permissions.');
  fs.chmodSync(appBundlePath(root), mode);
}

export function verifyMacSignature(root, execute = run) {
  const app = appBundlePath(root);
  execute('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
  const architectures = execute('/usr/bin/lipo', ['-archs', path.join(app, 'Contents/MacOS/Cursor')]).toString().trim().split(/\s+/);
  if (!architectures.some(arch => arch.startsWith('arm64'))) throw new Error('Cursor must contain an Apple Silicon executable.');
}

export function signMacApp(root, identity, execute = run) {
  const app = appBundlePath(root);
  if (!/^[a-f0-9]{40}$/i.test(identity || '')) throw new Error('An Apple signing identity SHA-1 is required.');
  const magic = new Set(['feedface', 'cefaedfe', 'feedfacf', 'cffaedfe', 'cafebabe', 'bebafeca', 'cafebabf', 'bfbafeca']);
  const args = ['--force', '--sign', identity, '--preserve-metadata=entitlements,flags,runtime', '--timestamp=none'];
  try {
    for (const relative of fs.readdirSync(app, {recursive:true})) {
      const file = path.join(app, relative);
      if (!fs.lstatSync(file).isFile()) continue;
      const fd = fs.openSync(file, 'r'), header = Buffer.alloc(4);
      try { fs.readSync(fd, header, 0, 4, 0); } finally { fs.closeSync(fd); }
      // Electron loads native modules outside the nested app bundles too.
      if (magic.has(header.toString('hex'))) execute('/usr/bin/codesign', [...args, file]);
    }
    execute('/usr/bin/codesign', [...args, '--deep', app]);
    verifyMacSignature(root, execute);
    execute(path.join(app, 'Contents/MacOS/Cursor'), ['-e', 'process.exit(0)'], {
      env:{...process.env, ELECTRON_RUN_AS_NODE:'1'}, timeout:30000
    });
  } catch (error) {
    throw new Error('Cursor signing or native loading failed. Reinstall the official Cursor app, then reinstall both links. ' + error.message, {cause:error});
  }
}
