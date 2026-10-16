import assert from 'node:assert/strict';
import {ensureClaudeTaskBubble,patchSubagentBubbles} from './subagent-bubbles.mjs';
import {normalizeClaudeSubagentModel} from './subagent-model.mjs';
import test from 'node:test';
function fixture() {
 const bubbles=new Map(),created=[];
 const parent={data:{modelConfig:{selectedModels:[{modelId:'claude-subscription/gpt-test'}]}}};
 const toolFormer={getBubbleIdByToolCallId:id=>bubbles.get(id),getOrCreateBubbleId:args=>{created.push(args);bubbles.set(args.toolCallId,'bubble-'+args.toolCallId);}};
 const service={loadComposerCapabilities(){},getComposerCapability:()=>toolFormer};
 const request={modelId:'claude-subscription/gpt-test',toolCallId:'task-1',subagentType:'explore',prompt:'Inspect the workspace',abortSignal:new AbortController().signal};
 class Params{constructor(values){Object.assign(this,values);}}
 const run=()=>ensureClaudeTaskBubble(service,request,parent,19,Params,3);
 return {bubbles,created,parent,toolFormer,service,request,run};
}
test('missing Claude Task bubble is created once with the original tool ID and prompt',()=>{
 const f=fixture();f.run();f.run();assert.equal(f.created.length,1);
 assert.equal(f.bubbles.get('task-1'),'bubble-task-1');
 assert.equal(f.created[0].params.value.prompt,f.request.prompt);
 assert.equal(f.created[0].params.value.model,f.request.modelId);
});
test('existing Task bubbles and their status are preserved',()=>{
 const f=fixture();f.bubbles.set('task-1','existing');f.run();assert.equal(f.created.length,0);assert.equal(f.bubbles.get('task-1'),'existing');
});
test('ordinary models and unrelated parent composers are not changed',()=>{
 const f=fixture();f.request.modelId='ordinary';f.run();assert.equal(f.created.length,0);
 f.request.modelId='claude-subscription/gpt-test';f.parent.data.modelConfig={modelName:'ordinary'};f.run();assert.equal(f.created.length,0);
});
test('cancelled subagent requests cannot create a Task bubble',()=>{
 const f=fixture();f.request.abortSignal=AbortSignal.abort();assert.throws(f.run,{name:'AbortError'});assert.equal(f.created.length,0);
});
test('missing parent or ToolFormer does not signal a successful creation',()=>{
 const f=fixture();f.service.getComposerCapability=()=>undefined;f.run();assert.equal(f.created.length,0);
 ensureClaudeTaskBubble(f.service,f.request,undefined,19,Object,3);assert.equal(f.created.length,0);
});

test('serialized Task-bubble helper executes without module imports',()=>{
 const anchor='async _waitForParentTaskBubbleIfPossible(e){const t=uY(e.parentConversationId),n=uY(e.toolCallId);if(!t||!n)return;const i=this._composerDataService.getHandleIfLoaded(t);';
 const patched=patchSubagentBubbles(anchor,'desktop','3.22.12');
 const helper=patched.slice(0,patched.indexOf(anchor));
 const isolated=new Function(helper+';return __ensureClaudeTaskBubble')();
 const f=fixture();
 isolated(f.service,f.request,f.parent,19,class Params{constructor(values){Object.assign(this,values);}},3);
 assert.equal(f.created.length,1);
 isolated(f.service,{...f.request,modelId:'ordinary'},f.parent,19,Object,3);
 assert.equal(f.created.length,1);
});
test('blank optional Task models use native inheritance without mutating input',()=>{
 for(const requestedModel of ['', '  ']){
  const input={parentModelId:'claude-subscription/test',requestedModel,forceModelId:'policy-model'};
  const result=normalizeClaudeSubagentModel(input);
  assert.equal(result.requestedModel,undefined);assert.equal(result.forceModelId,'policy-model');assert.equal(input.requestedModel,requestedModel);
 }
});
test('explicit and non-string model selections are preserved for native validation',()=>{
 for(const requestedModel of ['configured','inherit','not-a-model',undefined,null,1]){
  const input={parentModelId:'claude-subscription/test',requestedModel};assert.equal(normalizeClaudeSubagentModel(input),input);
 }
});
test('blank Task models for other providers retain the original validation',()=>{
 for(const parentModelId of ['ordinary','chatgpt-codex/opus',undefined]){
  const input={parentModelId,requestedModel:''};assert.equal(normalizeClaudeSubagentModel(input),input);
 }
});
