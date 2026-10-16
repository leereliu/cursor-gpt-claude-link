// Pure patch generation: never writes Cursor, starts a bridge, signs in or sends a model request.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {CURSOR_VERSION,workbenchEntry} from '../install-anchors.mjs';
import {patchWorkbenchSurface} from '../install-workbench.mjs';
import {patchRuntimeReasoning} from '../patch-runtime.mjs';
import {patchSubagentModel} from '../subagent-model.mjs';
import {patchSubagentSettingsRuntime} from '../subagent-settings.mjs';
import {patchConversationActionsRuntime} from '../conversation-actions.mjs';
import {patchAgentExecRegistration} from '../agent-exec-registration.mjs';
import {verifyAgentHostRouting} from './agent-host-routing-check.mjs';
import {verifyAgentExecRegistration} from './agent-exec-registration-check.mjs';
import {verifySubagentLifecycle} from './subagent-lifecycle-check.mjs';
import {verifySubagentSettings} from './subagent-settings-check.mjs';
import {verifyFiles} from '../build-support.mjs';
const metadata=JSON.parse(fs.readFileSync(new URL('../build-'+CURSOR_VERSION+'-darwin-arm64.json',import.meta.url)));
assert.equal(metadata.platform,'darwin');assert.equal(metadata.arch,'arm64');
assert.equal(metadata.commit,workbenchEntry().commit);
assert.ok(Object.values(metadata.files).every(hash=>/^[a-f0-9]{64}$/.test(hash)));
const windows=JSON.parse(fs.readFileSync(new URL('../build-3.24.12.json',import.meta.url)));
assert.equal(windows.platform,'win32');
assert.ok(fs.existsSync(new URL('../symbols-3.24.12.json',import.meta.url)));
console.log('Separate macOS metadata and upstream Windows 3.24.12 support verified.');
const root=process.argv[2];
if(root){
 // Source checks require the reviewed JS bundles; installation separately verifies every resource.
 verifyFiles(root,Object.fromEntries(Object.entries(metadata.files).filter(([name])=>name.endsWith('.js'))));
 assert.equal(JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version,CURSOR_VERSION);
 assert.equal(JSON.parse(fs.readFileSync(path.join(root,'product.json'))).commit,metadata.commit);
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'claude-mac-check-'));
 const syntax=(name,source)=>{const file=path.join(temporary,name+'.mjs');fs.writeFileSync(file,source);execFileSync(process.execPath,['--check',file],{stdio:'pipe'});};
 try{
  for(const surface of ['desktop','glass']){
   const original=fs.readFileSync(path.join(root,'out/vs/workbench/workbench.'+surface+'.main.js'),'utf8');
   const entry=workbenchEntry();
   const patched=patchWorkbenchSurface(original,surface,entry,entry.features,'claude-subscription/',CURSOR_VERSION,'');
   syntax(surface,patched);await verifyAgentHostRouting(patched);await verifySubagentLifecycle(patched,['claude-subscription/']);
   console.log(surface+': native anchors, syntax, routing and lifecycle passed.');
  }
  for(const name of ['cursor-agent-exec','cursor-local-agent-runtime']){
   const original=fs.readFileSync(path.join(root,'extensions',name,'dist/main.js'),'utf8');
   let patched=patchConversationActionsRuntime(patchSubagentSettingsRuntime(patchSubagentModel(patchRuntimeReasoning(original,'claude-subscription/'))),'claude-subscription/');
   if(name==='cursor-agent-exec'){patched=patchAgentExecRegistration(patched);await verifyAgentExecRegistration(patched);}
   syntax(name,patched);verifySubagentSettings(patched);
   console.log(name+': native anchors, provider, parameters and syntax passed.');
  }
 }finally{fs.rmSync(temporary,{recursive:true,force:true});}
}
