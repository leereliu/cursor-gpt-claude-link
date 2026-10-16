import {patchConversationActionsWorkbench,patchConversationActionsRuntime} from './conversation-actions.mjs';
import {patchSubagentLifecycle} from './subagent-lifecycle.mjs';
import {patchMaxMode} from './max-mode.mjs';
import {patchSubagentSettingsWorkbench, patchSubagentSettingsRuntime} from './subagent-settings.mjs';
import {patchSubagentModel} from './subagent-model.mjs';
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
import {buildAutostart} from './autostart.mjs';

const dir=path.dirname(fileURLToPath(import.meta.url));
const root=cursorRoot();
const manifestPath=path.join(dir,'installed.json');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const linkedManifests=linkedGptManifests();
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
  console.log('Claude patch removed. Reload Cursor.');process.exit();
}
if(fs.existsSync(manifestPath))throw new Error('Claude patch already installed. Restore before reinstalling.');
const product=JSON.parse(fs.readFileSync(path.join(root,'product.json'),'utf8'));
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
if(version!=='3.20.21'||product.commit!=='f09fca384ceca23f7bf21f9c23655b162641d740')throw new Error('This patch supports Cursor 3.20.21 build f09fca3 only.');
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
`;
const pending=[];
for(const surface of ['desktop','glass']){
  const desktop=surface==='desktop';
  const target=path.join(root,'out/vs/workbench/workbench.'+surface+'.main.js');
  let source=fs.readFileSync(target,'utf8');
  if(source.includes('const __claudeBridgeBase='))throw new Error('Claude patch marker already present.');
  source=prelude+source;
  source=patchPickerSections(source,once,desktop
    ?{groupReturn:'return c.mergeLeadingIntoPromotedSection===!0?{leading:[],promoted:[...re,...J],others:ce}:{leading:re,promoted:J,others:ce}',
      promotedAnchor:'WP(hmt,{models:B.promoted,title:c?.promotedSectionTitle',modelsVar:'B',jsx:'WP',fmt:'hmt',renderModel:'x'}
    :{groupReturn:'return l.mergeLeadingIntoPromotedSection===!0?{leading:[],promoted:[...te,...Q],others:ie}:{leading:te,promoted:Q,others:ie}',
      promotedAnchor:'bF(s8t,{models:N.promoted,title:l?.promotedSectionTitle',modelsVar:'N',jsx:'bF',fmt:'s8t',renderModel:'k'});
  source=once(source,'async refreshDefaultModels(){','async refreshDefaultModels(){await __refreshClaudeBridgeModels();');
  const getter=source.includes('return __withChatgptBridgeModels([...this._availableDefaultModels()])')
    ? 'getAvailableDefaultModels(){return __withChatgptBridgeModels([...this._availableDefaultModels()])}'
    : 'getAvailableDefaultModels(){return[...this._availableDefaultModels()]}';
  source=once(source,getter,getter.replace(/return\s*(.+)}/,'return __withClaudeBridgeModels($1)}'));
  const models=desktop?'c':'l', mapper=desktop?'V=>tpn(V)':'U=>xzn(U)';
  const map=source.includes(models+'=__withChatgptBridgeModels('+models+').map('+mapper+')')
    ? models+'=__withChatgptBridgeModels('+models+').map('+mapper+')' : models+'='+models+'.map('+mapper+')';
  source=once(source,map,map.replace('='+models+'.map','='+ '__withClaudeBridgeModels('+models+').map').replace('=__withChatgptBridgeModels('+models+').map','=__withClaudeBridgeModels(__withChatgptBridgeModels('+models+')).map'));
  const provider=desktop?'async getLocalAgentProviderConfig(e,t){':'async getLocalAgentProviderConfig(t,e){';
  const model=desktop?'t?.requestedModel?.modelId??e?.modelId':'e?.requestedModel?.modelId??t?.modelId';
  source=once(source,provider,provider+'if(__isClaudeBridgeModel('+model+'))return{baseUrl:__claudeBridgeBase+"/v1",apiKey:__claudeBridgeKey,customHeaders:{}};');
  const local=desktop?'Zc':'kl';
  if(source.includes('const __chatgptLocal=__isChatgptBridgeModel(u?.requestedModel?.modelId??i?.modelId);')){
    source=once(source,'const __chatgptLocal=__isChatgptBridgeModel(u?.requestedModel?.modelId??i?.modelId);',
      'const __chatgptLocal=__isChatgptBridgeModel(u?.requestedModel?.modelId??i?.modelId)||__isClaudeBridgeModel(u?.requestedModel?.modelId??i?.modelId);');
  }else{
    const before=desktop?'async run(e,t,n,i,r,s,o,a,c,l,u){const h=vjf(u,':'async run(t,e,n,i,r,s,o,a,l,c,u){const d=DyS(u,';
    const after=before.replace('{const ','{const __claudeLocal=__isClaudeBridgeModel(u?.requestedModel?.modelId??i?.modelId);const ');
    source=once(source,before,after);
    source=once(source,'localMode:'+local+'.localMode});if('+local+'.localMode){','localMode:'+local+'.localMode||__claudeLocal});if('+local+'.localMode||__claudeLocal){');
  }
  const native=desktop?'Gh(this.storageService,"useDedicatedLocalAgentRuntimeHost")':'qp(this.storageService,"useDedicatedLocalAgentRuntimeHost")';
  source=once(source,native,'(__isClaudeBridgeModel('+(desktop?'g':'p')+')&&Boolean(this.environmentService.remoteAuthority)||'+native+')');
  const activation=desktop?'function Sup(e){return Zc.localMode&&e?.get(pJ_,-1)==="true"}':'function _Ig(t){return kl.localMode&&t?.get(xIg,-1)==="true"}';
  if(source.includes(activation))source=once(source,activation,activation.replace('return ','return typeof __claudeBridgeBase==="string"||'));
  const usage=desktop
    ?{jsx:'Vvy',useState:'Wlr',useEffect:'Jfy',card:'b_',zs:'zs',bar:'xA',barStyle:'Klr',
      fn:'function Xvy(e){const t=ufp(119)',
      children:'title:"Plan & Usage",children:[yn,an,Kt,xn]',
      childrenGpt:'title:"Plan & Usage",children:[yn,an,Kt,xn,Vvy(__chatgptUsageSection,{})]'}
    :{jsx:'lH1',useState:'cus',useEffect:'aH1',card:'iv',zs:'Js',bar:'Im',barStyle:'yTi',
      fn:'function dH1(t){const e=dDg(119)',
      children:'title:"Plan & Usage",children:[ft,wt,gt,Tt]',
      childrenGpt:'title:"Plan & Usage",children:[ft,wt,gt,Tt,lH1(__chatgptUsageSection,{})]'};
  source=once(source,usage.fn,usageSectionSrc(usage)+usage.fn);
  const usageChildren=source.includes(usage.childrenGpt)?usage.childrenGpt:usage.children;
  source=once(source,usageChildren,usageChildren.slice(0,-1)+','+usage.jsx+'(__claudeUsageSection,{})]');
  source=patchMaxMode(patchSubagentSettingsWorkbench(source));
  source=patchSubagentBubbles(source,surface,'3.20.21');
  source=patchSubagentLifecycle(source,surface,'claude-subscription/');
  source=patchConversationActionsWorkbench(source,surface,'claude-subscription/');
  pending.push({path:target,content:source});
}
for(const name of ['cursor-agent-exec','cursor-local-agent-runtime']){
  const target=path.join(root,'extensions',name,'dist/main.js');let source=fs.readFileSync(target,'utf8');
  const anchor=source.includes('}(n);if(typeof t==="string"&&t.startsWith("chatgpt-codex/"))')
    ? '}(n);if(typeof t==="string"&&t.startsWith("chatgpt-codex/"))' : '}(n);if(void 0===a)return;if(void 0!==i&&"openai_compatible"===r)';
  source=once(source,anchor,'}(n);if(typeof t==="string"&&t.startsWith("claude-subscription/")){const selected=n?.find(p=>p.id==="reasoning")?.value;if(selected!==undefined)e.reasoning={...e.reasoning,effort:selected};const context=n?.find(p=>p.id==="context")?.value;if(context!==undefined)e.claude_context=Number(context);delete e.reasoning_effort;delete e.service_tier;return}'+anchor.slice(5));
  const heuristic='n.includes("codex")?"responses":"chat_completions"';
  const claudeHeuristic='n.includes("codex")||n.startsWith("claude-subscription/")?"responses":"chat_completions"';
  if(!source.includes(claudeHeuristic))source=once(source,heuristic,claudeHeuristic);
  source=patchConversationActionsRuntime(patchSubagentSettingsRuntime(patchSubagentModel(source)),'claude-subscription/');
  pending.push({path:target,content:source});
}
const main=path.join(root,'out/main.js');
pending.push({path:main,content:fs.readFileSync(main,'utf8')+buildAutostart({nodePath:process.execPath,bridgePath:path.join(dir,'bridge.mjs'),port:config.port})});
product.checksums['vs/workbench/workbench.desktop.main.js']=crypto.createHash('sha256').update(pending[0].content).digest('base64').replace(/=+$/,'');
pending.push({path:path.join(root,'product.json'),content:JSON.stringify(product,null,2)});
const backupDir=path.join(dir,'backups',String(Date.now()));fs.mkdirSync(backupDir,{recursive:true});
for(const [i,file] of pending.entries()){
  if(file.path.endsWith('.js')){const candidate=path.join(backupDir,i+'.mjs');fs.writeFileSync(candidate,file.content);execFileSync(process.execPath,['--check',candidate],{windowsHide:true,stdio:'pipe'});fs.unlinkSync(candidate);}
}
if(process.argv.includes('--check')){console.log('Cursor 3.20.21 Claude patch candidates passed syntax and anchor checks.');process.exit();}
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
console.log('Claude subscription models installed. Reload Cursor to activate.');
