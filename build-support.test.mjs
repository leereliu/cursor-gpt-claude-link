import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {macosMajorVersion,machineArch} from './macos.mjs';
const supportedMac=process.platform==='darwin'&&machineArch()==='arm64'&&macosMajorVersion()>=26;
import {getBuild, linkedGptManifests, overlayLinkedGptOriginals, readExistingManifest, requireSupportedOriginals, restoreInstalledFiles, sha256} from './build-support.mjs';

test('default companion discovery uses the macOS application-support directory', {skip:process.platform!=='darwin'}, () => {
  const previous=process.env.CURSOR_GPT_LINK_HOME;
  delete process.env.CURSOR_GPT_LINK_HOME;
  try {
    assert.ok(linkedGptManifests().includes(path.join(os.homedir(),'Library','Application Support','cursor-gpt-link','installed.json')));
    process.env.CURSOR_GPT_LINK_HOME='/tmp/custom-gpt-state';
    assert.ok(linkedGptManifests().includes('/tmp/custom-gpt-state/installed.json'));
  } finally {
    if(previous===undefined)delete process.env.CURSOR_GPT_LINK_HOME;
    else process.env.CURSOR_GPT_LINK_HOME=previous;
  }
});

test('the retired 3.21.12 Mac build remains unsupported', {skip:process.platform!=='darwin'}, t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'claude-build-test-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({version:'3.21.12'}));
  assert.throws(()=>getBuild(root),/Unsupported Cursor version|no reviewed macOS installer/);
});

test('the original macOS 3.22.12 build is accepted and another commit is rejected', {skip:!supportedMac}, t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'claude-current-build-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({version:'3.22.12'}));
  const product=path.join(root,'product.json');
  fs.writeFileSync(product,JSON.stringify({commit:'3a92974361033b2051526321308c2740fe5912c0'}));
  const build=getBuild(root);
  assert.equal(build.platform,'darwin');
  assert.equal(build.arch,'arm64');
  assert.equal(Object.keys(build.files).length,6);
  fs.writeFileSync(product,JSON.stringify({commit:'another-build'}));
  assert.throws(()=>getBuild(root),/Unsupported Cursor commit/);
});

test('unknown Cursor versions remain unsupported', t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'claude-unknown-build-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({version:'9.9.9'}));
  assert.throws(()=>getBuild(root),/Unsupported Cursor version|no reviewed macOS installer/);
});

test('3.20.17 is not a Mac install target', {skip:process.platform!=='darwin'}, t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'claude-old-build-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({version:'3.20.17'}));
  assert.throws(()=>getBuild(root),/Unsupported Cursor version|no reviewed macOS installer/);
});

test('combined installation cannot pass the preflight that archives stale Claude state', t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'claude-combined-test-'));
  const root=path.join(dir,'app'),state=path.join(dir,'gpt');
  const previous=process.env.CURSOR_GPT_LINK_HOME;
  t.after(()=>{if(previous===undefined)delete process.env.CURSOR_GPT_LINK_HOME;else process.env.CURSOR_GPT_LINK_HOME=previous;fs.rmSync(dir,{recursive:true,force:true});});
  process.env.CURSOR_GPT_LINK_HOME=state;
  fs.mkdirSync(root,{recursive:true});fs.mkdirSync(state);
  const build=JSON.parse(fs.readFileSync(new URL('./build-3.22.12'+(process.platform==='darwin'?'-darwin-arm64':'')+'.json',import.meta.url),'utf8'));
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({version:build.version}));
  const files=Object.entries(build.files).map(([relative,originalHash])=>{
    const file=path.join(root,relative);
    const contents=relative==='product.json'?JSON.stringify({commit:build.commit}):'combined fixture '+relative;
    fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,contents);
    return {path:file,originalHash,patchedHash:sha256(contents)};
  });
  const manifestPath=path.join(state,'installed.json');
  fs.writeFileSync(manifestPath,JSON.stringify({files,claudeManifest:path.join(dir,'installed.json')}));
  assert.throws(()=>overlayLinkedGptOriginals(root,build),/Restore Claude before reinstalling/);
  if(supportedMac)assert.throws(()=>requireSupportedOriginals(root),/Restore Claude before reinstalling/);
  fs.writeFileSync(manifestPath,JSON.stringify({files}));
  const expected=overlayLinkedGptOriginals(root,build);
  if(process.platform==='win32')assert.deepEqual(overlayLinkedGptOriginals(root.toUpperCase(),build),expected);
  for(const file of files)assert.equal(expected[path.relative(root,file.path).split(path.sep).join('/')],file.patchedHash);
  if(supportedMac)assert.equal(requireSupportedOriginals(root).version,build.version);
  const stamped=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  stamped.claudeManifest=path.join(dir,'installed.json');
  fs.writeFileSync(manifestPath,JSON.stringify(stamped));
  assert.throws(()=>overlayLinkedGptOriginals(root,build),/Restore Claude before reinstalling/);
});

test('leftover 3.20.17 uninstall reads the manifest without getBuild', t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'claude-leftover-restore-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const root=path.join(dir,'app');
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({version:'3.20.17'}));
  const file=path.join(root,'out.js'),backup=path.join(dir,'out.js.bak');
  fs.writeFileSync(file,'patched');fs.writeFileSync(backup,'original');
  const manifestPath=path.join(dir,'installed.json');
  const manifest={version:'3.20.17',files:[{path:file,backup,originalHash:sha256(Buffer.from('original')),patchedHash:sha256(Buffer.from('patched'))}],linked:[],appMode:0o755};
  fs.writeFileSync(manifestPath,JSON.stringify(manifest));
  const loaded=readExistingManifest(root,manifestPath);
  assert.equal(loaded.version,'3.20.17');
  if(process.platform==='darwin')assert.throws(()=>getBuild(root),/no reviewed macOS installer/);
  restoreInstalledFiles(loaded);
  assert.equal(fs.readFileSync(file,'utf8'),'original');
});

test('the macOS wrapper restores from the existing manifest without getBuild', () => {
  const dir=path.dirname(fileURLToPath(import.meta.url));
  const source=fs.readFileSync(path.join(dir,'install-macos.mjs'),'utf8');
  assert.equal(source.includes('getBuild('),false);
  assert.match(source,/readExistingManifest\(root,\s*manifestPath\)/);
  assert.match(source,/restoreInstalledFiles\(manifest\)/);
  assert.match(source,/requireSupportedOriginals\(root\)/);
});

test('the shared installer leaves installed.json for the macOS restore wrapper', () => {
  const dir=path.dirname(fileURLToPath(import.meta.url));
  const source=fs.readFileSync(path.join(dir,'install-workbench.mjs'),'utf8');
  assert.equal(source.includes("manifestPath+'.restored-'"),false);
  assert.equal(source.includes('unlinkSync(manifestPath)'),false);
  assert.match(source,/restoreInstalledFiles\(JSON\.parse\(fs\.readFileSync\(manifestPath/);
  assert.match(source,/appMode:\s*requireWritableApp\(root\)/);
  assert.match(source,/setAppMode\(root,\s*0o700\)/);
  assert.match(source,/pending\.some\(x\s*=>\s*x\.path\s*===\s*f\.path\)/);
  assert.match(source,/claudeManifest\s*=\s*manifestPath/);
  assert.match(source,/patchRemoteControlGuard\(source\)/);
});

function restoreFixture(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'claude-restore-test-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const files=['one.js','two.js'].map((name,i)=>{
    const file=path.join(dir,name),backup=path.join(dir,name+'.bak');
    fs.writeFileSync(file,'patched '+i);fs.writeFileSync(backup,'original '+i);
    return {path:file,backup,originalHash:sha256(Buffer.from('original '+i)),patchedHash:sha256(Buffer.from('patched '+i))};
  });
  return {dir,files};
}

test('restore retries after an interrupted copy and skips already-restored targets', t=>{
  const {files}=restoreFixture(t);
  fs.writeFileSync(files[0].path,'original 0');
  restoreInstalledFiles({files,linked:[]});
  assert.equal(fs.readFileSync(files[0].path,'utf8'),'original 0');
  assert.equal(fs.readFileSync(files[1].path,'utf8'),'original 1');
});

test('restore refuses unknown bytes before copying remaining files', t=>{
  const {files}=restoreFixture(t);
  fs.writeFileSync(files[1].path,'tampered');
  assert.throws(()=>restoreInstalledFiles({files,linked:[]}),/Files changed/);
  assert.equal(fs.readFileSync(files[0].path,'utf8'),'patched 0');
});

test('restore writes linked GPT originals and continues if that checkout is gone', t=>{
  const {dir,files}=restoreFixture(t);
  const gpt=path.join(dir,'gpt-installed.json');
  const original=JSON.stringify({files:[{path:files[0].path,patchedHash:files[0].originalHash}]},null,2);
  fs.writeFileSync(gpt,'not-json');
  restoreInstalledFiles({files,linked:[{path:gpt,original}]});
  assert.equal(fs.readFileSync(gpt,'utf8'),original);
  assert.equal(fs.readFileSync(files[0].path,'utf8'),'original 0');
  restoreInstalledFiles({files,linked:[{path:path.join(dir,'missing-gpt','installed.json'),original}]});
  const leftover=path.join(dir,'gpt-state');
  fs.mkdirSync(leftover);
  const archived=path.join(leftover,'installed.json');
  restoreInstalledFiles({files,linked:[{path:archived,original}]});
  assert.equal(fs.existsSync(archived),false);
});

test('restore rethrows non-ENOENT linked GPT write errors', t=>{
  const {dir,files}=restoreFixture(t);
  const blocked=path.join(dir,'gpt-dir');
  fs.mkdirSync(blocked);
  assert.throws(()=>restoreInstalledFiles({files,linked:[{path:blocked,original:'{}'}]}),{code:'EISDIR'});
  if(process.platform==='win32'||(typeof process.getuid==='function'&&process.getuid()===0))return;
  const denied=path.join(dir,'gpt-denied.json');
  fs.writeFileSync(denied,'x');
  fs.chmodSync(denied,0o444);
  try {
    assert.throws(()=>restoreInstalledFiles({files,linked:[{path:denied,original:'{}'}]}),error=>error.code==='EACCES'||error.code==='EPERM');
  } finally {
    fs.chmodSync(denied,0o600);
  }
});
