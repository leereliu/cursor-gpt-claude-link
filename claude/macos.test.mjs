import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {signMacApp, verifyMacSignature, requireWritableApp, signingIdentity, setAppMode} from './macos.mjs';

test('signing and resource restoration preserve hardened runtime and entitlements', {skip:process.platform !== 'darwin'}, t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-signing-test-'));
  t.after(() => fs.rmSync(dir, {recursive:true, force:true}));
  const app = path.join(dir, 'Cursor.app'), root = path.join(app, 'Contents/Resources/app');
  const executable = path.join(app, 'Contents/MacOS/Cursor');
  fs.mkdirSync(root, {recursive:true});
  fs.mkdirSync(path.dirname(executable), {recursive:true});
  const fixtureSource=path.join(dir,'fixture.c');
  fs.writeFileSync(fixtureSource,'int main(void) { return 0; }\n');
  execFileSync('/usr/bin/clang',[fixtureSource,'-o',executable],{stdio:'pipe'});
  fs.chmodSync(executable, 0o755);
  fs.writeFileSync(path.join(app, 'Contents/Info.plist'), '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>Cursor</string><key>CFBundleIdentifier</key><string>test.cursor.signing</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>');
  const entitlements = path.join(dir, 'entitlements.plist');
  fs.writeFileSync(entitlements, '<?xml version="1.0"?><plist version="1.0"><dict><key>com.apple.security.cs.allow-jit</key><true/></dict></plist>');
  const resource = path.join(root, 'fixture.txt');
  fs.writeFileSync(resource, 'original');
  execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', '--options', 'runtime', '--entitlements', entitlements, app], {stdio:'pipe'});
  const originalMode=fs.statSync(app).mode&0o777;
  assert.equal(requireWritableApp(root),originalMode);
  assert.equal(fs.statSync(app).mode&0o777,originalMode,'preflight must preserve app permissions');
  setAppMode(root,0o700);
  let nativeLoads = 0;
  // CI has no Apple private key; only this synthetic app uses an ad-hoc identity.
  const execute = (file, args, options = {}) => {
    const adapted = [...args], index = adapted.indexOf('--sign');
    if (index >= 0) adapted[index + 1] = '-';
    if (file.endsWith('/Contents/MacOS/Cursor')) nativeLoads++;
    return execFileSync(file, adapted, {stdio:'pipe', timeout:30000, ...options});
  };
  for (const content of ['patched', 'original']) {
    fs.writeFileSync(resource, content);
    assert.throws(() => verifyMacSignature(root));
    signMacApp(root, '0'.repeat(40), execute);
    if(content==='original')setAppMode(root,originalMode);
    verifyMacSignature(root);
    assert.equal(fs.statSync(app).mode&0o777,content==='original'?originalMode:0o700);
    const details = spawnSync('/usr/bin/codesign', ['--display', '--verbose=4', app], {encoding:'utf8'});
    assert.equal(details.status,0,details.stderr);
    assert.match(details.stderr, /flags=.*runtime/);
    const preserved = execFileSync('/usr/bin/codesign', ['--display', '--entitlements', '-', app], {encoding:'utf8', stdio:['ignore', 'pipe', 'pipe']});
    assert.match(preserved, /com.apple.security.cs.allow-jit/);
    assert.equal(fs.readFileSync(resource, 'utf8'), content);
  }
  assert.equal(nativeLoads, 2);
  setAppMode(root,undefined);
  assert.equal(fs.statSync(app).mode&0o777,originalMode);
  assert.throws(()=>setAppMode(root,'777'),/Invalid recorded Cursor app permissions/);
  assert.throws(() => signMacApp(root, '-', execute), /Apple signing identity/);
  assert.throws(() => signMacApp(root, '0'.repeat(40), () => { throw new Error('signing interrupted'); }), /Reinstall the official Cursor app/);
});

test('signing requires an Apple identity before changing the app', () => {
  const previous = process.env.CURSOR_MACOS_SIGN_IDENTITY;
  delete process.env.CURSOR_MACOS_SIGN_IDENTITY;
  try {
    assert.throws(() => signingIdentity(), /CURSOR_MACOS_SIGN_IDENTITY/);
    assert.throws(() => signingIdentity('-'), /CURSOR_MACOS_SIGN_IDENTITY/);
    if(process.platform==='darwin')assert.throws(() => signingIdentity('0'.repeat(40)), /not available in Keychain/);
  } finally {
    if (previous !== undefined) process.env.CURSOR_MACOS_SIGN_IDENTITY = previous;
  }
});

test('a valid signature cannot admit an Intel-only Cursor executable', {skip:process.platform!=='darwin'}, t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cursor-intel-test-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const app=path.join(dir,'Cursor.app'),root=path.join(app,'Contents/Resources/app');
  const executable=path.join(app,'Contents/MacOS/Cursor');
  fs.mkdirSync(root,{recursive:true});fs.mkdirSync(path.dirname(executable),{recursive:true});
  fs.writeFileSync(path.join(app,'Contents/Info.plist'),'<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>Cursor</string><key>CFBundleIdentifier</key><string>test.cursor.intel</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>');
  execFileSync('/usr/bin/lipo',['/usr/bin/true','-thin','x86_64','-output',executable],{stdio:'pipe'});
  execFileSync('/usr/bin/codesign',['--force','--sign','-',app],{stdio:'pipe'});
  assert.throws(()=>verifyMacSignature(root),/Apple Silicon executable/);
});
