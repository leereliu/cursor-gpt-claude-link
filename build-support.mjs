import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {assertSupportedMac} from './macos.mjs';
import {CURSOR_VERSION} from './install-anchors.mjs';

export const sha256=value=>crypto.createHash('sha256').update(value).digest('hex');

// Version `--restore` helpers leave installed.json in place so install.mjs can
// re-sign Cursor and then archive the manifest.
export function restoreInstalledFiles(manifest) {
  for (const file of manifest.files) {
    const current=sha256(fs.readFileSync(file.path));
    if ((current!==file.patchedHash&&current!==file.originalHash)||sha256(fs.readFileSync(file.backup))!==file.originalHash)
      throw new Error('Files changed. Restore stopped: '+file.path);
  }
  for (const file of manifest.files)
    if (sha256(fs.readFileSync(file.path))===file.patchedHash) fs.copyFileSync(file.backup,file.path);
  for (const linked of manifest.linked??[]) {
    try {
      if (typeof linked?.path!=='string'||typeof linked?.original!=='string') continue;
      if (!fs.existsSync(linked.path)) continue;
      fs.writeFileSync(linked.path,linked.original);
    } catch (error) {
      if (error?.code!=='ENOENT') throw error;
    }
  }
}

export function macOSProductVersion() {
  if(process.platform!=='darwin')return null;
  try{
    return execFileSync('sw_vers',['-productVersion'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
  }catch{
    return null;
  }
}

export function assertSupportedClient(build) {
  if(process.platform==='darwin')return assertSupportedMac(build);
  if(process.platform!=='win32'||process.arch!=='x64'||build.platform!=='win32'||build.arch!=='x64')throw new Error('Unsupported client platform or build architecture.');
}

export function cursorRoot() {
  if(process.env.CURSOR_APP_ROOT)return path.resolve(process.env.CURSOR_APP_ROOT);
  const roots=[
    ...(process.platform==='darwin'?['/Applications/Cursor.app/Contents/Resources/app',path.join(os.homedir(),'Applications/Cursor.app/Contents/Resources/app')]:[process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'Programs/cursor/resources/app'),process.env.ProgramFiles&&path.join(process.env.ProgramFiles,'Cursor/resources/app')]),
  ].filter(Boolean);
  const root=roots.find(p=>fs.existsSync(path.join(p,'product.json')));
  if(!root)throw new Error('Cursor was not found. Set CURSOR_APP_ROOT to its Resources/app directory.');
  return root;
}
export function linkedGptManifests() {
  return [...new Set([path.join(os.homedir(),'cursor-chatgpt-bridge/installed.json'),
    path.join(process.env.CURSOR_GPT_LINK_HOME||(process.platform==='darwin'?path.join(os.homedir(),'Library','Application Support','cursor-gpt-link'):path.join(process.env.LOCALAPPDATA||os.homedir(),'cursor-gpt-link')),'installed.json')])];
}
// Builds up to 3.22.12 have an installer of their own and are listed here. From
// 3.24.12 a build is supported when its reviewed files exist: the hashes in
// build-<version>.json and the symbols in symbols-<version>.json.
const legacyBuilds=['3.20.7','3.20.11','3.20.17','3.20.21','3.20.23','3.21.1','3.21.9','3.21.12','3.21.13','3.21.16','3.21.18','3.22.5','3.22.9','3.22.12'];
export function isSupportedVersion(version){
  return legacyBuilds.includes(version)||
    (fs.existsSync(new URL('./build-'+version+'.json',import.meta.url))&&fs.existsSync(new URL('./symbols-'+version+'.json',import.meta.url)));
}
export function symbolsFor(version){
  const file=new URL('./symbols-'+version+'.json',import.meta.url);
  return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):undefined;
}
export function getBuild(root) {
  const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
  if(!isSupportedVersion(version))throw new Error('Unsupported Cursor version: '+version);
  const suffix=process.platform==='darwin'?'-darwin-arm64':'';
  const metadata=new URL('./build-'+version+suffix+'.json',import.meta.url);
  if(process.platform==='darwin'&&(version!==CURSOR_VERSION||!fs.existsSync(metadata)))throw new Error('Cursor '+version+' has no reviewed macOS installer. The imported Mac port targets '+CURSOR_VERSION+'.');
  const build=JSON.parse(fs.readFileSync(metadata,'utf8'));
  assertSupportedClient(build);
  if(JSON.parse(fs.readFileSync(path.join(root,'product.json'),'utf8')).commit!==build.commit)throw new Error('Unsupported Cursor commit.');
  return build;
}
export function verifyFiles(root,files) {
  for(const [relative,expected] of Object.entries(files)){
    if(sha256(fs.readFileSync(path.join(root,relative)))!==expected)throw new Error('Unrecognized or modified Cursor file: '+relative);
  }
}
export function overlayLinkedGptOriginals(root, build) {
  const expected={...build.files};
  const normalized=value=>process.platform==='win32'?path.resolve(value).toLowerCase():path.resolve(value);
  for(const manifestPath of linkedGptManifests().filter(p=>fs.existsSync(p))){
    const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
    const matching=manifest.files.filter(f=>normalized(f.path).startsWith(normalized(root)+path.sep));
    if(!matching.length)continue;
    if(manifest.claudeManifest)throw new Error('Claude is already installed over GPT. Restore Claude before reinstalling.');
    // A known local GPT installation may wrap the supported original bundles.
    for(const entry of matching){
      const relative=path.relative(root,entry.path).split(path.sep).join('/');
      if(!(relative in expected))continue;
      if(entry.originalHash!==build.files[relative])throw new Error('GPT was installed over an unrecognized original Cursor build.');
      if(sha256(fs.readFileSync(entry.path))!==entry.patchedHash)throw new Error('GPT manifest differs from Cursor. Restore or repair that installation first.');
      expected[relative]=entry.patchedHash;
    }
  }
  return expected;
}

export function requireSupportedOriginals(root) {
  const build=getBuild(root);
  verifyFiles(root,overlayLinkedGptOriginals(root,build));
  return build;
}

// Restore reads the recorded manifest and the app's package.json version. It
// must not call getBuild(): leftover 3.20.17 installs have to uninstall after
// this checkout moved to a newer supported Mac build. 3.20.17 is not a Mac
// install target.
export function readExistingManifest(root, manifestPath) {
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
  if(manifest.version!==version||manifest.files.some(file=>typeof file.path!=='string'||!file.path.startsWith(root+path.sep)))
    throw new Error('The installation belongs to another Cursor app or version. Reinstall official Cursor instead of restoring these files.');
  return manifest;
}
