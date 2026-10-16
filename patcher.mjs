import {installRuntime} from './src/runtime-install.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import net from 'node:net';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildPatches} from './src/combined-patches.mjs';
import {supportedBuild} from './src/supported-builds.mjs';
import {installFiles, restoreFiles, hash} from './src/installation.mjs';
import {stateDir, configPath} from './src/config.mjs';

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
let build;
const manifestPath = path.join(stateDir, 'installed.json');
const args = process.argv.slice(2);
const command = args.shift() || 'help';
const options = {};
while (args.length) {
  const flag = args.shift();
  if (!['--cursor-root', '--codex-path', '--codex-home', '--port', '--claude-path', '--claude-port'].includes(flag) || !args.length || args[0].startsWith('--')) {
    throw new Error('Unknown or incomplete option: ' + flag);
  }
  options[flag.slice(2)] = args.shift();
}

function cursorRoot() {
  const candidates = options['cursor-root'] ? [options['cursor-root']] : [
    ...(process.platform === 'darwin' ? ['/Applications/Cursor.app/Contents/Resources/app'] : []),
    path.join(process.env.LOCALAPPDATA || '', 'Programs/cursor/resources/app'),
    path.join(process.env.ProgramFiles || 'C:/Program Files', 'Cursor/resources/app')
  ];
  const root = candidates.find(p => fs.existsSync(path.join(p, 'package.json')));
  if (!root) throw new Error('Cursor not found. Pass --cursor-root with the resources/app directory.');
  return path.resolve(root);
}

function validate(root) {
  build=supportedBuild(root);
  if (process.platform !== build.platform || process.arch !== build.arch) {
    throw new Error('Platform or architecture does not match the reviewed build.');
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const product = JSON.parse(fs.readFileSync(path.join(root, 'product.json'), 'utf8'));
  if (pkg.version !== build.version || product.commit !== build.commit) {
    throw new Error('Unsupported Cursor build. Expected ' + build.version + ' (' + build.commit + ').');
  }
  for (const [relative, expected] of Object.entries(build.files)) {
    const bytes = fs.readFileSync(path.join(root, relative));
    if (hash(bytes) === expected) continue;
    throw new Error('Original file does not match the supported build: ' + relative + '. Restore existing patches first.');
  }
}

function codexPath() {
  if (options['codex-path']) {
    const selected = path.resolve(options['codex-path']);
    if (!fs.existsSync(selected) || (process.platform === 'win32' && !selected.endsWith('.exe'))) throw new Error('--codex-path must point to a Codex executable.');
    fs.accessSync(selected, fs.constants.X_OK);
    return selected;
  }
  const bundled = path.join(process.env.LOCALAPPDATA || '', 'Programs/OpenAI/Codex/bin/codex.exe');
  if (fs.existsSync(bundled)) return bundled;
  try {
    const found = execFileSync('where.exe', ['codex.exe'], {encoding:'utf8', windowsHide:true}).trim().split(/\r?\n/)[0];
    if (fs.existsSync(found)) return found;
  } catch {}
  throw new Error('Codex executable not found. Pass --codex-path with the path to codex.exe.');
}

function requireClosedCursor() {
  if (process.platform === 'darwin') {
    const list = execFileSync('/bin/ps', ['-axo', 'comm='], {encoding:'utf8'});
    if (list.split('\n').some(line => line.trim().startsWith('/Applications/Cursor.app/Contents/MacOS/'))) throw new Error('Close Cursor before installing or restoring.');
    return;
  }
  const list = execFileSync('tasklist.exe', ['/FI', 'IMAGENAME eq Cursor.exe', '/FO', 'CSV', '/NH'], {encoding:'utf8', windowsHide:true});
  if (/"Cursor\.exe"/i.test(list)) throw new Error('Close all Cursor windows and background processes before installing or restoring.');
}

async function availablePort(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new Error('Loopback port is already in use. Stop the old bridge or choose --port.')));
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}

async function prepare(root, cfg) {
  const {pickerModels} = await import('./src/bridge.mjs');
  const models = pickerModels();
  if (!models.length) throw new Error('No models found. Sign in and open Codex once to refresh its model catalog.');
  const {requireSubscription}=await import('./claude/runner.mjs');
  const {discoverModels}=await import('./claude/catalog.mjs');
  await requireSubscription(cfg.claude,{cwd:sourceDir});
  const claudeCatalog=await discoverModels(cfg.claude,{cwd:sourceDir});
  return buildPatches({root, cfg, models, claudeCatalog, nodePath:process.execPath,
    bridgePath:path.join(stateDir, 'runtime/bridge.mjs'), stateDir});
}

async function main() {
  if (command === 'help' || command === '--help') {
    console.log(`Usage: node patcher.mjs <check|install|status|restore> [options]

  --cursor-root PATH   Cursor resources/app directory (detected by default)
  --codex-path PATH    Codex executable used for sign-in and token renewal
  --codex-home PATH    Existing Codex home containing auth.json and models_cache.json
  --port NUMBER        Loopback port (default 43187)

State and backups: ${stateDir}
Set CURSOR_GPT_LINK_HOME before running to override that directory.
check verifies the original build without changing Cursor files.
Close Cursor before install or restore. See README.md for requirements.`);
    return;
  }
  if (command === 'status') {
    if (!fs.existsSync(manifestPath)) { console.log('No installation recorded in ' + stateDir); return; }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const valid = manifest.files.every(f => fs.existsSync(f.path) && hash(fs.readFileSync(f.path)) === f.patchedHash);
    console.log('Cursor ' + manifest.version + ': ' + (valid ? 'patched files verified' : 'files changed; possibly updated or installation incomplete'));
    if (!valid) process.exitCode = 1;
    return;
  }
  if (command === 'restore') {
    requireClosedCursor();
    restoreFiles(manifestPath);
    console.log('ChatGPT patch removed. Backups retained.');
    const claudeDir=[path.join(sourceDir,'../cursor-claude-link'),path.join(os.homedir(),'cursor-claude-link')].find(dir=>fs.existsSync(path.join(dir,'install.mjs')));
    if(claudeDir)console.log('If Claude models disappear, run npm run install:patch in '+path.resolve(claudeDir));
    return;
  }
  if (!['check', 'install'].includes(command)) throw new Error('Unknown command: ' + command);
  const root = cursorRoot();
  validate(root);
  if (command === 'check') { console.log('Supported original Cursor ' + build.version + ' build verified.'); return; }
  requireClosedCursor();
  if (fs.existsSync(manifestPath)) throw new Error('Installation already recorded. Use status or restore first.');
  const port = Number(options.port || 43187);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Port must be an integer between 1024 and 65535.');
  const claudePort=Number(options['claude-port']||43188);
  if(!Number.isInteger(claudePort)||claudePort<1024||claudePort>65535||claudePort===port)throw new Error('Claude requires a distinct valid loopback port.');
  await availablePort(port);await availablePort(claudePort);
  const {findClaude}=await import('./claude/cli-path.mjs');
  const claude=options['claude-path']?path.resolve(options['claude-path']):findClaude();
  fs.accessSync(claude,fs.constants.X_OK);
  const cfg = {port, claudePort, claude, key:crypto.randomBytes(32).toString('hex'), codex:codexPath(),
    codexHome:path.resolve(options['codex-home'] || process.env.CODEX_HOME || path.join(os.homedir(), '.codex'))};
  fs.mkdirSync(stateDir, {recursive:true});
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), {mode:0o600});
  // The bridge module is imported only after writing configuration.
  // config.mjs was loaded earlier, so update the shared object before importing it.
  const {config} = await import('./src/config.mjs');
  Object.assign(config, cfg);
  const pending = await prepare(root, cfg);
  const backupDir = path.join(stateDir, 'backups', build.version + '-' + Date.now());
  fs.mkdirSync(backupDir, {recursive:true});
  for (let n = 0; n < pending.length; n++) {
    const file = pending[n];
    if (!file.path.endsWith('.js')) continue;
    const candidate = path.join(backupDir, 'candidate-' + n + '.mjs');
    fs.writeFileSync(candidate, file.content);
    execFileSync(process.execPath, ['--check', candidate], {stdio:'pipe', windowsHide:true});
    fs.unlinkSync(candidate);
  }
  const runtime = path.join(stateDir, 'runtime');
  installRuntime(sourceDir,runtime);
  installFiles(pending, {backupDir, manifestPath, version:build.version, commit:build.commit});
  console.log('Installed GPT and Claude together. Start Cursor and select a subscription model.');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
