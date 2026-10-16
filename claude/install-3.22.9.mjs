import {patchConversationActionsWorkbench,patchConversationActionsRuntime} from './conversation-actions.mjs';
import {patchSubagentLifecycle} from './subagent-lifecycle.mjs';
import {patchMaxMode} from './max-mode.mjs';
import {patchSubagentSettingsWorkbench, patchSubagentSettingsRuntime} from './subagent-settings.mjs';
import {patchSubagentModel} from './subagent-model.mjs';
import {patchRuntime} from './patches-runtime.mjs';
import {patchSubagentBubbles} from './subagent-bubbles.mjs';
import {cursorRoot,linkedGptManifests,requireSupportedOriginals} from './build-support.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
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
import {applyToDisk, readBlock, sshConfigPath} from './ssh-forwarding.mjs';
import {syncKnownHosts} from './remote-runtime.mjs';
import {link as remoteLink, marker as remoteMarker, prefix as remotePrefix, patchRuntime as remotePatchRuntime} from './runtime-link.mjs';

const dir=path.dirname(fileURLToPath(import.meta.url));
const root=cursorRoot();
const manifestPath=path.join(dir,'installed.json');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const linkedManifests=linkedGptManifests();
// From 3.22.9 a remote session runs the agent on the SSH host, so the bridge is
// published on that host's loopback through an ssh reverse forward.
const owner='cursor-claude-link';
const sshHosts=(process.argv.find(a=>a.startsWith('--ssh-hosts='))??'').slice('--ssh-hosts='.length).split(',').map(h=>h.trim()).filter(Boolean);
const skipSsh=process.argv.includes('--no-ssh');
function reportSsh(result){
  if(!result.changed){console.log('ssh forwarding: '+(result.reason??'unchanged'));return;}
  console.log('ssh forwarding: '+result.configPath+(result.hosts.length?' -> '+result.hosts.join(', '):' (entries removed)'));
  if(result.unknown?.length)console.log('ssh forwarding: not declared in the file, added anyway: '+result.unknown.join(', '));
}
if(process.argv.includes('--restore')){
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  for(const f of manifest.files){if(hash(fs.readFileSync(f.path))!==f.patchedHash||hash(fs.readFileSync(f.backup))!==f.originalHash)throw new Error('Files changed. Restore stopped: '+f.path);}
  for(const f of manifest.files)fs.copyFileSync(f.backup,f.path);
  for(const linked of manifest.linked){
    const current=JSON.parse(fs.readFileSync(linked.path,'utf8'));
    for(const entry of current.files){const restored=manifest.files.find(f=>f.path===entry.path);if(restored)entry.patchedHash=restored.originalHash;}
    fs.writeFileSync(linked.path,JSON.stringify(current,null,2));
  }
  fs.renameSync(manifestPath,manifestPath+'.restored-'+Date.now());
  if(!skipSsh)reportSsh(applyToDisk({owner,remove:true}));
  console.log('Claude patch removed. Reload Cursor.');process.exit();
}
if(fs.existsSync(manifestPath))throw new Error('Claude patch already installed. Restore before reinstalling.');
const product=JSON.parse(fs.readFileSync(path.join(root,'product.json'),'utf8'));
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
if(version!=='3.22.9'||product.commit!=='2ca0f45baa06796a86f6c6ba2b9bedacaf94c370')throw new Error('This patch supports Cursor 3.22.9 build 2ca0f45 only.');
requireSupportedOriginals(root);
const configPath=path.join(dir,'config.json');
const config=fs.existsSync(configPath)?JSON.parse(fs.readFileSync(configPath,'utf8')):{port:43188,key:crypto.randomBytes(32).toString('hex'),claude:findClaude()};
if(!Number.isInteger(config.port)||config.port<1024||config.port>65535||typeof config.key!=='string'||!/^[a-f0-9]{64}$/.test(config.key))throw new Error('Invalid local bridge configuration.');
await requireSubscription(config.claude,{cwd:dir});
const catalog=await discoverModels(config.claude,{cwd:dir});
fs.writeFileSync(configPath,JSON.stringify(config,null,2),{mode:0o600});
function once(source,before,after){if(source.split(before).length!==2)throw new Error('Unsupported or repeated patch anchor: '+before.slice(0,100));return source.replace(before,after);}
const base='http://127.0.0.1:'+config.port;
const prelude=`
var __claudeBridgeModels=${JSON.stringify(pickerModels(catalog))};
const __claudeBridgeBase=${JSON.stringify(base)},__claudeBridgeKey=${JSON.stringify(config.key)};
function __isClaudeBridgeModel(m){return typeof m==="string"&&m.startsWith("claude-subscription/")}
function __withClaudeBridgeModels(models){return [...__claudeBridgeModels,...models.filter(m=>!__isClaudeBridgeModel(m.name))]}
async function __refreshClaudeBridgeModels(){try{const r=await fetch(__claudeBridgeBase+"/picker-models",{headers:{Authorization:"Bearer "+__claudeBridgeKey},signal:AbortSignal.timeout(25000)});if(!r.ok)return;const v=await r.json();if(Array.isArray(v.models)&&v.models.length)__claudeBridgeModels=v.models}catch{}}
${pickerSectionHelpersSrc}
${usageLabelHelpersSrc}
`;
const pending=[];
for(const surface of ['desktop','glass']){
  const desktop=surface==='desktop';
  const target=path.join(root,'out/vs/workbench/workbench.'+surface+'.main.js');
  let source=fs.readFileSync(target,'utf8');
  // The declaration, not the name: a companion's picker section mentions this
  // constant defensively when it renders the usage label.
  if(source.includes('const __claudeBridgeBase='))throw new Error('Claude patch marker already present.');
  source=prelude+source;
  source=patchPickerSections(source,once,desktop
    ?{groupReturn:'return c.mergeLeadingIntoPromotedSection===!0?{leading:[],promoted:[...se,...ee],others:ae}:{leading:se,promoted:ee,others:ae}',
      promotedAnchor:'tL(Zmt,{models:B.promoted,title:c?.promotedSectionTitle',modelsVar:'B',jsx:'tL',fmt:'Zmt',renderModel:'x'}
    :{groupReturn:'return l.mergeLeadingIntoPromotedSection===!0?{leading:[],promoted:[...ne,...X],others:ie}:{leading:ne,promoted:X,others:ie}',
      promotedAnchor:'bF(u8t,{models:N.promoted,title:l?.promotedSectionTitle',modelsVar:'N',jsx:'bF',fmt:'u8t',renderModel:'w'});
  source=once(source,'async refreshDefaultModels(){','async refreshDefaultModels(){await __refreshClaudeBridgeModels();');
  const getter=source.includes('return __withChatgptBridgeModels([...this._availableDefaultModels()])')
    ? 'getAvailableDefaultModels(){return __withChatgptBridgeModels([...this._availableDefaultModels()])}'
    : 'getAvailableDefaultModels(){return[...this._availableDefaultModels()]}';
  source=once(source,getter,getter.replace(/return\s*(.+)}/,'return __withClaudeBridgeModels($1)}'));
  const models=desktop?'c':'l', mapper=desktop?'j=>gNt(j)':'U=>oln(U)';
  const map=source.includes(models+'=__withChatgptBridgeModels('+models+').map('+mapper+')')
    ? models+'=__withChatgptBridgeModels('+models+').map('+mapper+')' : models+'='+models+'.map('+mapper+')';
  source=once(source,map,map.replace('='+models+'.map','='+ '__withClaudeBridgeModels('+models+').map').replace('=__withChatgptBridgeModels('+models+').map','=__withClaudeBridgeModels(__withChatgptBridgeModels('+models+')).map'));
  const provider=desktop?'async getLocalAgentProviderConfig(e,t){':'async getLocalAgentProviderConfig(t,e){';
  const model=desktop?'t?.requestedModel?.modelId??e?.modelId':'e?.requestedModel?.modelId??t?.modelId';
  source=once(source,provider,provider+'if(__isClaudeBridgeModel('+model+'))return{baseUrl:__claudeBridgeBase+"/v1",apiKey:__claudeBridgeKey,customHeaders:{}};');
  const local=desktop?'Rc':'vl';
  if(source.includes('const __chatgptLocal=__isChatgptBridgeModel(u?.requestedModel?.modelId??i?.modelId);')){
    source=once(source,'const __chatgptLocal=__isChatgptBridgeModel(u?.requestedModel?.modelId??i?.modelId);',
      'const __chatgptLocal=__isChatgptBridgeModel(u?.requestedModel?.modelId??i?.modelId)||__isClaudeBridgeModel(u?.requestedModel?.modelId??i?.modelId);');
  }else{
    const before=desktop?'async run(e,t,n,i,r,s,o,a,c,l,u){const h=_Gd(u,':'async run(t,e,n,i,r,s,o,a,l,c,u){const d=Hkm(u,';
    const after=before.replace('{const ','{const __claudeLocal=__isClaudeBridgeModel(u?.requestedModel?.modelId??i?.modelId);const ');
    source=once(source,before,after);
    source=once(source,'localMode:'+local+'.localMode});if('+local+'.localMode){','localMode:'+local+'.localMode||__claudeLocal});if('+local+'.localMode||__claudeLocal){');
  }
  // Remote sessions keep Cursor's own routing: the agent runs on the SSH host,
  // where the workspace actually lives, and reaches the bridge through the ssh
  // reverse forward. The dedicated UI runtime resolved remote paths with the
  // client's path module and looked for "/srv/app" under "C:\srv\app".
  const usage=desktop
    ?{jsx:'v7y',useState:'Jhr',useEffect:'E8y',card:'Sv',zs:'ks',bar:'yR',barStyle:'opr',
      fn:'function k7y(e){const t=pxp(119)',
      children:'title:"Plan & Usage",children:[qt,Jt,Pt,on]',
      childrenGpt:'title:"Plan & Usage",children:[qt,Jt,Pt,on,v7y(__chatgptUsageSection,{})]'}
    :{jsx:'FCk',useState:'fms',useEffect:'OCk',card:'rf',zs:'Hs',bar:'Rg',barStyle:'TIi',
      fn:'function jCk(t){const e=$Qg(119)',
      children:'title:"Plan & Usage",children:[lt,dt,gt,vt]',
      childrenGpt:'title:"Plan & Usage",children:[lt,dt,gt,vt,FCk(__chatgptUsageSection,{})]'};
  source=once(source,usage.fn,usageSectionSrc(usage)+usage.fn);
  const usageChildren=source.includes(usage.childrenGpt)?usage.childrenGpt:usage.children;
  source=once(source,usageChildren,usageChildren.slice(0,-1)+','+usage.jsx+'(__claudeUsageSection,{})]');
  source=patchMaxMode(patchSubagentSettingsWorkbench(source));
  source=patchSubagentBubbles(source,surface,'3.22.9');
  source=patchSubagentLifecycle(source,surface,'claude-subscription/','3.22.9');
  source=patchConversationActionsWorkbench(source,surface,'claude-subscription/');
  pending.push({path:target,content:source});
}
for(const name of ['cursor-agent-exec','cursor-local-agent-runtime']){
  const target=path.join(root,'extensions',name,'dist/main.js');
  pending.push({path:target,content:patchRuntime(fs.readFileSync(target,'utf8'))});
}
const main=path.join(root,'out/main.js');
pending.push({path:main,content:fs.readFileSync(main,'utf8')+buildAutostart({nodePath:process.execPath,bridgePath:path.join(dir,'bridge.mjs'),port:config.port})});
product.checksums['vs/workbench/workbench.desktop.main.js']=crypto.createHash('sha256').update(pending[0].content).digest('base64').replace(/=+$/,'');
pending.push({path:path.join(root,'product.json'),content:JSON.stringify(product,null,2)});
const backupDir=path.join(dir,'backups',String(Date.now()));fs.mkdirSync(backupDir,{recursive:true});
for(const [i,file] of pending.entries()){
  if(file.path.endsWith('.js')){const candidate=path.join(backupDir,i+'.mjs');fs.writeFileSync(candidate,file.content);execFileSync(process.execPath,['--check',candidate],{windowsHide:true,stdio:'pipe'});fs.unlinkSync(candidate);}
}
if(process.argv.includes('--check')){console.log('Cursor 3.22.9 Claude patch candidates passed syntax and anchor checks.');process.exit();}
const manifest={version,files:[],linked:[]};
for(const manifestFile of linkedManifests.filter(f=>fs.existsSync(f))){
  const text=fs.readFileSync(manifestFile,'utf8'),linked=JSON.parse(text);
  for(const f of linked.files)if(hash(fs.readFileSync(f.path))!==f.patchedHash)throw new Error('Existing GPT manifest does not match current files.');
  manifest.linked.push({path:manifestFile,original:text});
}
for(const [i,file] of pending.entries()){
  const backup=path.join(backupDir,i+'.original');fs.copyFileSync(file.path,backup);
  manifest.files.push({path:file.path,backup,originalHash:hash(fs.readFileSync(file.path)),patchedHash:hash(file.content)});
}
fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2));
try{
  for(const file of pending)fs.writeFileSync(file.path,file.content);
  for(const linked of manifest.linked){const value=JSON.parse(linked.original);for(const f of value.files){const changed=manifest.files.find(x=>x.path===f.path);if(changed)f.patchedHash=changed.patchedHash;}fs.writeFileSync(linked.path,JSON.stringify(value,null,2));}
}catch(error){for(const f of manifest.files)fs.copyFileSync(f.backup,f.path);for(const f of manifest.linked)fs.writeFileSync(f.path,f.original);fs.renameSync(manifestPath,manifestPath+'.rolled-back');throw error;}
if(!skipSsh)reportSsh(applyToDisk({owner,port:config.port,hosts:sshHosts}));
// Hosts that already carry the runtime patch are brought to this build too; a
// host that was never patched is left alone.
if(!process.argv.includes('--no-remote')){
  try{
    const hosts=readBlock(fs.readFileSync(sshConfigPath(),'utf8')).hosts;
    if(hosts.length)syncKnownHosts({hosts,link:remoteLink,marker:remoteMarker,prefix:remotePrefix,patchRuntime:remotePatchRuntime});
  }catch(error){console.log('remote runtime: skipped, '+error.message);}
}
console.log('Claude subscription models installed. Reload Cursor to activate.');
