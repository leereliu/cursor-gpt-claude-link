import {maxModeVariant,patchMaxMode} from './max-mode.mjs';
import {execFileSync} from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import {subscriptionEnvironment, contextEnvironment, prepareRequest as prepare} from './runner.mjs';
import {pickerModels, providerModels} from './models.mjs';
import {sanitizeModels} from './catalog.mjs';
import {formatPlan, parseReset, parseUsageWindows, zonedDateToEpoch} from './usage.mjs';
import {usageSectionSrc} from './usage-section.mjs';
import {withSubscriptionPickerSections, patchPickerSections} from './picker-sections.mjs';
import {bridgeCommandPattern, bridgeCommandPosixPattern, buildBridgeLauncher} from './autostart.mjs';
const catalog=sanitizeModels([
 {value:'sonnet',displayName:'Sonnet',supportsEffort:true,supportedEffortLevels:['low','medium','high','xhigh','max']},
 {value:'fable',displayName:'Fable',supportsEffort:true,supportedEffortLevels:['high','max']},
 {value:'haiku',displayName:'Haiku'}]);
const prepareRequest=body=>prepare(body,catalog);

test('Claude MAX composes with the GPT helper as an ES module and preserves both providers',()=>{
 const native='function solve(m,p,x){if(m.variants.length===0||!x&&m.supportsNonMaxMode===!1)return;if(m.name?.startsWith("chatgpt-codex/")){const v=__subscriptionMaxModeVariant(m,p,x);if(v)return{model:m,variant:v,parameters:v.parameterValues}}return "native";}';
 const gpt=native+'\n'+maxModeVariant.toString().replace('function maxModeVariant','function __subscriptionMaxModeVariant');
 const patched=patchMaxMode(gpt,'claude-subscription/');
 execFileSync(process.execPath,['--check','--input-type=module'],{input:patched,stdio:'pipe'});
 const solve=new Function(patched+';return solve;')();
 const variants=[false,true].map(isMaxMode=>({isMaxMode,parameterValues:[{id:'reasoning',value:'high'},{id:'context',value:isMaxMode?'1000000':'200000'}]}));
 for(const prefix of ['chatgpt-codex/','claude-subscription/'])for(const max of [false,true]){
  const result=solve({name:prefix+'test',variants},variants[0].parameterValues,max);
  assert.equal(result.variant.isMaxMode,max);
  assert.equal(result.parameters.find(p=>p.id==='reasoning').value,'high');
 }
 assert.equal(solve({name:'ordinary',variants},[],false),'native');
});

test('subscription environment removes API keys and third-party provider overrides',()=>{
  const env=subscriptionEnvironment({PATH:'test',ANTHROPIC_API_KEY:'not-a-real-key',ANTHROPIC_AUTH_TOKEN:'test',ANTHROPIC_BASE_URL:'test',CLAUDE_CODE_USE_BEDROCK:'1',CLAUDE_CODE_OAUTH_TOKEN:'test'});
  assert.deepEqual(env,{PATH:'test'});
});
test('conversation and tool results survive request preparation',()=>{
  const input=[{role:'user',content:'Add 19 and 23'}, {type:'function_call',call_id:'test-call',name:'add',arguments:'{"a":19,"b":23}'}, {type:'function_call_output',call_id:'test-call',output:'42'}];
  const value=prepareRequest({model:'claude-subscription/sonnet',input,tools:[{type:'function',name:'add',parameters:{type:'object'}}],tool_choice:{type:'function',name:'add'},parallel_tool_calls:false});
  assert.deepEqual(JSON.parse(value.prompt).conversation,[input[0],{...input[1],name:'cursor_tool_0'},input[2]]);
  assert.equal(value.schema.properties.tool_calls.minItems,1);
  assert.equal(value.schema.properties.tool_calls.maxItems,1);
});
test('external tool names cannot collide with disabled Claude Code built-ins',()=>{
  const value=prepareRequest({model:'claude-subscription/sonnet',input:'Write a file.',tools:[{type:'function',name:'Write',description:'Write a file.',parameters:{type:'object'}}],tool_choice:{type:'function',name:'Write'}});
  const prompt=JSON.parse(value.prompt);
  assert.equal(prompt.availableTools[0].name,'cursor_tool_0');
  assert.equal(prompt.availableTools[0].cursorName,'Write');
  assert.equal(prompt.toolChoice.name,'cursor_tool_0');
  assert.deepEqual(value.schema.properties.tool_calls.items.properties.name.enum,['cursor_tool_0']);
});
test('invalid attachments, models and Fast mode fail explicitly',()=>{
  assert.throws(()=>prepareRequest({model:'other',input:[]}));
  assert.throws(()=>prepareRequest({model:'claude-subscription/sonnet',input:[{role:'user',content:[{type:'input_image',image_url:'test'}]}]}));
  assert.throws(()=>prepareRequest({model:'claude-subscription/sonnet',input:[],service_tier:'priority'}));
});
test('model picker keeps Claude aliases separate with image capability and no Fast mode',()=>{
  assert.equal(pickerModels(catalog).length,3);
  for(const m of pickerModels(catalog)){
    assert.ok(m.name.startsWith('claude-subscription/'));
    assert.equal(m.supportsImages,true);
    assert.equal(m.parameterDefinitions.some(p=>p.id==='fast'),false);
    assert.equal(m.variants.filter(v=>v.isDefaultNonMaxConfig).length,1);
  }
  const listed=providerModels(catalog);
  assert.equal(listed[0].id,'claude-subscription/sonnet');
  assert.deepEqual(listed[0].api_types,['openai_responses']);
});

test('catalog controls model membership and per-model efforts',()=>{
 assert.equal(prepareRequest({model:'claude-subscription/fable',input:[],reasoning:{effort:'max'}}).model,'fable');
 assert.throws(()=>prepareRequest({model:'claude-subscription/fable',input:[],reasoning:{effort:'low'}}));
 assert.throws(()=>prepareRequest({model:'claude-subscription/haiku',input:[],reasoning:{effort:'high'}}));
 assert.throws(()=>sanitizeModels([{value:'duplicate'},{value:'duplicate'}]));
 assert.throws(()=>sanitizeModels([]));
 assert.throws(()=>sanitizeModels([{value:'--bad value'}]));
 const clean=sanitizeModels([{value:'sonnet',email:'private@example.test',supportsEffort:true,supportedEffortLevels:['high','unknown']}]);
 assert.equal(clean[0].email,undefined);assert.deepEqual(clean[0].supportedEffortLevels,['high']);
});
const contextCatalog=sanitizeModels([
 {value:'default',resolvedModel:'claude-opus-5[1m]',displayName:'Default',description:'Opus 5 with 1M context · Default'},
 {value:'opus[1m]',resolvedModel:'claude-opus-5[1m]',displayName:'Opus (1M context)',description:'Opus 5 with 1M context · Complex work',supportsEffort:true,supportedEffortLevels:['low','medium','high','xhigh','max']},
 {value:'claude-fable-5-1[1m]',resolvedModel:'claude-fable-5-1',displayName:'Fable',description:'Fable 5.1 · Difficult tasks'},
 {value:'sonnet',resolvedModel:'claude-sonnet-5',displayName:'Sonnet',description:'Sonnet 5 · Everyday tasks'},
 {value:'haiku',resolvedModel:'claude-haiku-4-5',displayName:'Haiku',description:'Haiku 4.5 · Quick answers'}
]);
test('context variants share one model and preserve every effort combination',()=>{
 const models=pickerModels(contextCatalog);
 assert.equal(models.length,4);
 assert.ok(models.every(m=>!m.name.includes('[1m]')&&!m.clientDisplayName.includes('context')));
 const opus=models.find(m=>m.name==='claude-subscription/opus');
 assert.equal(opus.clientDisplayName,'Claude Opus 5');assert.equal(opus.variants.length,10);
 assert.deepEqual(opus.parameterDefinitions.find(p=>p.id==='context').parameterType.enumParameter.values.map(v=>v.value),['200000','1000000']);
 assert.equal(opus.variants.filter(v=>v.isDefaultNonMaxConfig).length,1);
 assert.ok(opus.idAliases.includes('claude-subscription/default'));
 assert.ok(opus.idAliases.includes('claude-subscription/opus[1m]'));
 assert.ok(opus.tooltipData.markdownContent.includes('architecture'));
 assert.equal(models.find(m=>m.name.endsWith('/haiku')).parameterDefinitions.some(p=>p.id==='context'),false);
});
test('context selection reaches CLI model and isolates per-request environment',()=>{
 for(const [id,cli] of [['opus','opus'],['claude-fable-5-1','claude-fable-5-1'],['sonnet','sonnet']]){
  for(const context of [200000,1000000]){
   const request=prepare({model:'claude-subscription/'+id,input:[],claude_context:context},contextCatalog);
   assert.equal(request.model,cli+(context===1000000?'[1m]':''));assert.equal(request.contextTokens,context);
  }
 }
 assert.equal(prepare({model:'claude-subscription/opus[1m]',input:[]},contextCatalog).contextTokens,1000000);
 assert.throws(()=>prepare({model:'claude-subscription/haiku',input:[],claude_context:1000000},contextCatalog));
 assert.throws(()=>prepare({model:'claude-subscription/sonnet',input:[],claude_context:300000},contextCatalog));
 const inherited={PATH:'test',CLAUDE_CODE_DISABLE_1M_CONTEXT:'1',CLAUDE_CODE_AUTO_COMPACT_WINDOW:'180000',DISABLE_COMPACT:'1'};
 assert.deepEqual(contextEnvironment(1000000,inherited),{PATH:'test'});
 assert.deepEqual(contextEnvironment(200000,inherited),{PATH:'test',CLAUDE_CODE_DISABLE_1M_CONTEXT:'1'});
 assert.equal(inherited.DISABLE_COMPACT,'1');
});
test('usage parser maps Claude windows and reset times without leaking extra text',()=>{
  const now=new Date('2026-09-10T18:00:00Z');
  const windows=parseUsageWindows('You are currently using your subscription to power your Claude Code usage\n\nCurrent session: 12% used · resets Sep 11, 1:09am (Europe/Berlin)\nCurrent week (all models): 40% used · resets Sep 16, 8:59am (Europe/Berlin)\nCurrent week (Fable): 0% used · resets Sep 16, 8:59am (Europe/Berlin)\n\nLast 7d · 53 requests · 2 sessions\n  Top MCP servers: lexware-office 9%', now);
  assert.equal(windows.length,3);
  assert.equal(windows[0].id,'session');
  assert.equal(windows[0].label,'5-hour session');
  assert.equal(windows[0].usedPercent,12);
  assert.equal(windows[0].resetAt,zonedDateToEpoch(2026,8,11,1,9,'Europe/Berlin'));
  assert.equal(windows[1].id,'week');
  assert.equal(windows[2].id,'fable');
  assert.equal(JSON.stringify(windows).includes('lexware-office'),false);
  assert.equal(formatPlan('max'),'Max');
  const atStyle=parseReset('resets Aug 10 at 8:59pm (Asia/Seoul)', new Date('2026-08-10T00:00:00Z'));
  assert.equal(atStyle.resetAt,zonedDateToEpoch(2026,7,10,20,59,'Asia/Seoul'));
});
test('picker sections keep Claude and ChatGPT out of Cursor Models',()=>{
  const grouped=withSubscriptionPickerSections({
    leading:[{name:'auto'}],
    promoted:[{name:'claude-subscription/opus'},{name:'composer-2.5'}],
    others:[{name:'chatgpt-codex/gpt-6-astra'},{name:'claude-opus-5'}]
  });
  assert.deepEqual(grouped.promoted.map(m=>m.name),['composer-2.5']);
  assert.deepEqual(grouped.others.map(m=>m.name),['claude-opus-5']);
  assert.deepEqual(grouped.claude.map(m=>m.name),['claude-subscription/opus']);
  assert.deepEqual(grouped.chatgpt.map(m=>m.name),['chatgpt-codex/gpt-6-astra']);
  assert.deepEqual(grouped.leading.map(m=>m.name),['auto']);
});
test('picker section patch inserts ChatGPT and Claude headings without duplicating them',()=>{
  const once=(source,before,after)=>{if(source.split(before).length!==2)throw new Error(before);return source.replace(before,after);};
  const groupReturn='return c.mergeLeadingIntoPromotedSection===!0?{leading:[],promoted:[...re,...J],others:ce}:{leading:re,promoted:J,others:ce}';
  const promotedAnchor='WP(fmt,{models:B.promoted,title:c?.promotedSectionTitle';
  const source=patchPickerSections(groupReturn+promotedAnchor,once,{groupReturn,promotedAnchor,modelsVar:'B',jsx:'WP',fmt:'fmt',renderModel:'x'});
  assert.match(source,/__withSubscriptionPickerSections\(/);
  assert.match(source,/title:"ChatGPT Subscription"/);
  assert.match(source,/title:"Claude Subscription"/);
  const twice=patchPickerSections(source,once,{groupReturn,promotedAnchor,modelsVar:'B',jsx:'WP',fmt:'fmt',renderModel:'x'});
  assert.equal(twice.split('chatgpt-subscription-models').length,2);
});
test('usage settings card fetches the local Claude usage route',()=>{
  const src=usageSectionSrc({jsx:'M0t',useState:'Klr',useEffect:'avp',card:'Jb',zs:'zs',bar:'EA',barStyle:'tur'});
  assert.match(src,/__claudeUsageSection/);
  assert.match(src,/__claudeBridgeBase\+"\/usage"/);
  assert.match(src,/Claude Subscription/);
  assert.match(src,/Next reset/);
});
test('autostart restarts only the Claude bridge worker',()=>{
  const nodePath='/usr/local/bin/node';
  const bridgePath='/Users/example/cursor-claude-link/bridge.mjs';
  assert.match(bridgeCommandPattern(nodePath,bridgePath),/cursor-claude-link/);
  assert.equal(bridgeCommandPosixPattern(nodePath,bridgePath).includes('\\s'),false);
  assert.match(bridgeCommandPosixPattern(nodePath,bridgePath),/\[\[:space:\]\]/);
  const src=buildBridgeLauncher({nodePath,bridgePath,port:43188});
  assert.match(src,/cursor-claude-link/);
  assert.match(src,/pkill",\["-f"/);
  assert.match(src,/\[\[:space:\]\]/);
  assert.equal(src.includes('\\s'),false);
  assert.match(src,/process\.platform==="darwin"/);
  assert.match(src,/process\.platform==="win32"/);
  assert.match(src,/windowsHide:true/);
  const encoded=src.match(/EncodedCommand","([^"]+)/)[1];
  const decoded=Buffer.from(encoded,'base64').toString('utf16le');
  assert.match(decoded,/cursor-claude-link/);
  assert.equal(decoded.includes('Get-NetTCPConnection'),false);
  assert.equal(src.includes('cursor-gpt-link'),false);
});
test('installer rejects non-macOS Apple Silicon clients',async()=>{
  const {assertSupportedClient,macOSProductVersion}=await import('./build-support.mjs');
  const {machineArch}=await import('./macos.mjs');
  const build={platform:'darwin',arch:'arm64',osMinimum:'26.0'};
  if(process.platform==='darwin'&&machineArch()==='arm64'){
    const version=macOSProductVersion();
    const major=Number(String(version||'').split('.')[0]);
    if(Number.isFinite(major)&&major>=26)assert.doesNotThrow(()=>assertSupportedClient(build));
    else assert.throws(()=>assertSupportedClient(build),/macOS 26\+/);
  }else{
    assert.throws(()=>assertSupportedClient(build),/macOS 26\+|Unsupported client/);
  }
});

test('each Claude variant describes its selected context and effort',()=>{
 for(const m of pickerModels(contextCatalog))for(const v of m.variants){
  const effort=v.parameterValues.find(p=>p.id==='reasoning')?.value;
  const context=v.parameterValues.find(p=>p.id==='context')?.value;
  const text=v.tooltipData.markdownContent;
  assert.ok(text.includes(context==='1000000'?'1M context window':'200k context window'));
  if(effort)assert.ok(text.endsWith('*Version: '+(effort==='xhigh'?'very high':effort)+' effort*'));
  else assert.equal(text.includes('Version:'),false);
  assert.equal(text.includes('Context:'),false);
 }
});

test('MAX selects the Claude 1M variant and keeps effort in both directions',()=>{
 const picker=pickerModels(contextCatalog).find(m=>m.name==='claude-subscription/opus');
 assert.equal(picker.supportsMaxMode,true);
 assert.equal(picker.variants.filter(v=>v.isDefaultMaxConfig).length,1);
 for(const variant of picker.variants)for(const maxMode of [false,true]){
  const selected=maxModeVariant(picker,variant.parameterValues,maxMode);
  const context=selected.parameterValues.find(p=>p.id==='context').value;
  const effort=selected.parameterValues.find(p=>p.id==='reasoning').value;
  assert.equal(context,maxMode?'1000000':'200000');
  assert.equal(effort,variant.parameterValues.find(p=>p.id==='reasoning').value);
  const request=prepare({model:picker.name,input:[],reasoning:{effort},claude_context:Number(context)},contextCatalog);
  assert.equal(request.contextTokens,Number(context));
  assert.equal(request.model,maxMode?'opus[1m]':'opus');
 }
 const meta=providerModels(contextCatalog);
 assert.equal(meta.find(m=>m.id===picker.name).capabilities.context_length,1000000);
 assert.equal(meta.find(m=>m.id.endsWith('/haiku')).capabilities.context_length,200000);
});

test('picker separates standard and extended limits while runtime retains provider capacity',()=>{
 const models=pickerModels(contextCatalog),provider=providerModels(contextCatalog);
 for(const model of models){
  assert.equal(model.contextTokenLimit,200000);
  const maximum=model.supportsMaxMode?1000000:200000;
  assert.equal(model.contextTokenLimitForMaxMode,maximum);
  assert.equal(provider.find(p=>p.id===model.name).capabilities.context_length,maximum);
 }
});

test('provider context compatibility fields agree',()=>{
  for(const entry of providerModels(catalog))assert.equal(entry.context_window,entry.capabilities.context_length);
});
