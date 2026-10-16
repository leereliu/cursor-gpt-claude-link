import {patchConversationActionsWorkbench, patchConversationActionsRuntime} from './conversation-actions.mjs';
import {patchSubagentLifecycle} from './subagent-lifecycle.mjs';
import {patchMaxMode} from './max-mode.mjs';
import {patchSubagentSettingsWorkbench, patchSubagentSettingsRuntime} from './subagent-settings.mjs';
import {patchSubagentModel} from './subagent-model.mjs';
import {patchSubagentBubbles} from './subagent-bubbles.mjs';
import {CURSOR_VERSION, SUBSCRIPTION_PREFIX, workbenchEntry} from './install-anchors.mjs';
import {once, patchLocalBridgeMode, patchRuntimeReasoning} from './patch-runtime.mjs';
import {patchRemoteControlGuard} from './remote-control.mjs';
import {patchAgentExecRegistration} from './agent-exec-registration.mjs';
import {cursorRoot, linkedGptManifests, requireSupportedOriginals, restoreInstalledFiles, sha256} from './build-support.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {pickerModels} from './models.mjs';
import {requireSubscription} from './runner.mjs';
import {discoverModels} from './catalog.mjs';
import {findClaude} from './cli-path.mjs';
import {usageSectionSrc} from './usage-section.mjs';
import {pickerSectionHelpersSrc, patchPickerSections} from './picker-sections.mjs';
import {usageLabelHelpersSrc} from './usage-label.mjs';
import {buildAutostart} from './autostart.mjs';
import {requireWritableApp, setAppMode} from './macos.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));

export function writePatchedFiles({root, pending, version}) {
  const backupDir = path.join(dir, 'backups', String(Date.now()));
  fs.mkdirSync(backupDir, {recursive: true});
  for (const [i, file] of pending.entries()) {
    if (file.path.endsWith('.js')) {
      const candidate = path.join(backupDir, i + '.mjs');
      fs.writeFileSync(candidate, file.content);
      execFileSync(process.execPath, ['--check', candidate], {stdio: 'pipe'});
      fs.unlinkSync(candidate);
    }
  }
  if (process.argv.includes('--check')) {
    console.log('Cursor ' + version + ' Claude patch candidates passed syntax and anchor checks.');
    process.exit();
  }
  const manifestPath = path.join(dir, 'installed.json');
  const manifest = {version, files: [], linked: [], appMode: requireWritableApp(root)};
  for (const manifestFile of linkedGptManifests().filter(f => fs.existsSync(f))) {
    const text = fs.readFileSync(manifestFile, 'utf8'), linked = JSON.parse(text);
    if (!linked.files.some(f => pending.some(x => x.path === f.path))) continue;
    for (const f of linked.files) if (pending.some(x => x.path === f.path) && sha256(fs.readFileSync(f.path)) !== f.patchedHash) throw new Error('Existing GPT manifest does not match current files.');
    manifest.linked.push({path: manifestFile, original: text});
  }
  for (const [i, file] of pending.entries()) {
    const backup = path.join(backupDir, i + '.original');
    fs.copyFileSync(file.path, backup);
    manifest.files.push({path: file.path, backup, originalHash: sha256(fs.readFileSync(file.path)), patchedHash: sha256(file.content)});
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  try {
    setAppMode(root, 0o700);
    for (const file of pending) fs.writeFileSync(file.path, file.content);
    for (const linked of manifest.linked) {
      const value = JSON.parse(linked.original);
      for (const f of value.files) {
        const changed = manifest.files.find(x => x.path === f.path);
        if (changed) f.patchedHash = changed.patchedHash;
      }
      value.claudeManifest = manifestPath;
      fs.writeFileSync(linked.path, JSON.stringify(value, null, 2));
    }
  } catch (error) {
    for (const f of manifest.files) fs.copyFileSync(f.backup, f.path);
    for (const f of manifest.linked) fs.writeFileSync(f.path, f.original);
    setAppMode(root, manifest.appMode);
    fs.renameSync(manifestPath, manifestPath + '.rolled-back');
    throw error;
  }
}

export function patchWorkbenchSurface(source, surfaceName, anchors, features, prefix, version, workbenchPrelude) {
  const surface = anchors[surfaceName];
  source = workbenchPrelude + source;
  source = patchPickerSections(source, once, surface.picker);
  source = once(source, 'async refreshDefaultModels(){', 'async refreshDefaultModels(){await __refreshClaudeBridgeModels();');
  const getter = source.includes('return __withChatgptBridgeModels([...this._availableDefaultModels()])')
    ? 'getAvailableDefaultModels(){return __withChatgptBridgeModels([...this._availableDefaultModels()])}'
    : 'getAvailableDefaultModels(){return[...this._availableDefaultModels()]}';
  source = once(source, getter, getter.replace(/return\s*(.+)}/, 'return __withClaudeBridgeModels($1)}'));
  const models = surface.models, mapper = surface.mapper;
  const map = source.includes(models + '=__withChatgptBridgeModels(' + models + ').map(' + mapper + ')')
    ? models + '=__withChatgptBridgeModels(' + models + ').map(' + mapper + ')' : models + '=' + models + '.map(' + mapper + ')';
  source = once(source, map, map.replace('=' + models + '.map', '=' + '__withClaudeBridgeModels(' + models + ').map').replace('=__withChatgptBridgeModels(' + models + ').map', '=__withClaudeBridgeModels(__withChatgptBridgeModels(' + models + ')).map'));
  source = once(source, surface.provider, surface.provider + 'if(__isClaudeBridgeModel(' + surface.model + '))return{baseUrl:__claudeBridgeBase+"/v1",apiKey:__claudeBridgeKey,customHeaders:{}};');
  source = patchLocalBridgeMode(source, surface);
  source = once(source, surface.native, '(__isClaudeBridgeModel(' + surface.nativeModel + ')&&Boolean(this.environmentService.remoteAuthority)||' + surface.native + ')');
  if (source.includes(surface.activation)) source = once(source, surface.activation, surface.activation.replace('return ', 'return typeof __claudeBridgeBase==="string"||'));
  source = patchRemoteControlGuard(source);
  source = once(source, surface.usage.fn, usageSectionSrc(surface.usage) + surface.usage.fn);
  const usageChildren = source.includes(surface.usage.childrenGpt) ? surface.usage.childrenGpt : surface.usage.children;
  source = once(source, usageChildren, usageChildren.slice(0, -1) + ',' + surface.usage.jsx + '(__claudeUsageSection,{})]');
  if (features.max) source = patchMaxMode(source, prefix);
  if (features.settings) source = patchSubagentSettingsWorkbench(source, prefix);
  if (features.bubbles) source = patchSubagentBubbles(source, surfaceName, version);
  if (features.lifecycle) source = patchSubagentLifecycle(source, surfaceName, prefix, version);
  if (features.actions) source = patchConversationActionsWorkbench(source, surfaceName, prefix);
  return source;
}

export async function installVersion(version = CURSOR_VERSION) {
  const anchors = workbenchEntry(version);
  const features = anchors.features;
  const prefix = SUBSCRIPTION_PREFIX;
  const root = cursorRoot();
  const manifestPath = path.join(dir, 'installed.json');
  if (process.argv.includes('--restore')) {
    restoreInstalledFiles(JSON.parse(fs.readFileSync(manifestPath, 'utf8')));
    console.log('Claude patch removed. Reload Cursor.');
    process.exit();
  }
  if (fs.existsSync(manifestPath)) throw new Error('Claude patch already installed. Restore before reinstalling.');
  const product = JSON.parse(fs.readFileSync(path.join(root, 'product.json'), 'utf8'));
  const installedVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  if (installedVersion !== version || product.commit !== anchors.commit) throw new Error('This patch supports Cursor ' + version + ' build ' + anchors.commit.slice(0, 7) + ' only.');
  requireSupportedOriginals(root);
  const configPath = path.join(dir, 'config.json');
  const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {port: 43188, key: crypto.randomBytes(32).toString('hex'), claude: findClaude()};
  if (!Number.isInteger(config.port) || config.port < 1024 || config.port > 65535 || typeof config.key !== 'string' || !/^[a-f0-9]{64}$/.test(config.key)) throw new Error('Invalid local bridge configuration.');
  await requireSubscription(config.claude, {cwd: dir});
  const catalog = await discoverModels(config.claude, {cwd: dir});
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), {mode: 0o600});
  const base = 'http://127.0.0.1:' + config.port;
  const prelude = `
var __claudeBridgeModels=${JSON.stringify(pickerModels(catalog))};
const __claudeBridgeBase=${JSON.stringify(base)},__claudeBridgeKey=${JSON.stringify(config.key)};
function __isClaudeBridgeModel(m){return typeof m==="string"&&m.startsWith(${JSON.stringify(prefix)})}
function __withClaudeBridgeModels(models){return [...__claudeBridgeModels,...models.filter(m=>!__isClaudeBridgeModel(m.name))]}
async function __refreshClaudeBridgeModels(){try{const r=await fetch(__claudeBridgeBase+"/picker-models",{headers:{Authorization:"Bearer "+__claudeBridgeKey},signal:AbortSignal.timeout(25000)});if(!r.ok)return;const v=await r.json();if(Array.isArray(v.models)&&v.models.length)__claudeBridgeModels=v.models}catch{}}
${pickerSectionHelpersSrc}
${usageLabelHelpersSrc}
`;
  const pending = [];
  for (const surfaceName of ['desktop', 'glass']) {
    const target = path.join(root, 'out/vs/workbench/workbench.' + surfaceName + '.main.js');
    let source = fs.readFileSync(target, 'utf8');
    // The declaration, not the name: a companion's picker section mentions this
    // constant defensively when it renders the usage label.
    if (source.includes('const __claudeBridgeBase=')) throw new Error('Claude patch marker already present.');
    pending.push({path: target, content: patchWorkbenchSurface(source, surfaceName, anchors, features, prefix, version, prelude)});
  }
  for (const name of ['cursor-agent-exec', 'cursor-local-agent-runtime']) {
    const target = path.join(root, 'extensions', name, 'dist/main.js');
    let source = fs.readFileSync(target, 'utf8');
    source = patchRuntimeReasoning(source, prefix);
    if (features.model) source = patchSubagentModel(source);
    if (features.settings) source = patchSubagentSettingsRuntime(source, prefix);
    if (features.actions) source = patchConversationActionsRuntime(source, prefix);
    if (name === 'cursor-agent-exec') source = patchAgentExecRegistration(source);
    pending.push({path: target, content: source});
  }
  const main = path.join(root, 'out/main.js');
  pending.push({path: main, content: fs.readFileSync(main, 'utf8') + buildAutostart({nodePath: process.execPath, bridgePath: path.join(dir, 'bridge.mjs'), port: config.port})});
  product.checksums['vs/workbench/workbench.desktop.main.js'] = crypto.createHash('sha256').update(pending[0].content).digest('base64').replace(/=+$/, '');
  pending.push({path: path.join(root, 'product.json'), content: JSON.stringify(product, null, 2)});
  writePatchedFiles({root, pending, version});
  console.log('Claude subscription models installed. Reload Cursor to activate.');
}
