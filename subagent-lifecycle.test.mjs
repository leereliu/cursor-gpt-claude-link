import {verifySubagentLifecycle} from './scripts/subagent-lifecycle-check.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {getEventListeners} from 'node:events';
import {subscriptionComposer, createSubscriptionSubagent, runSubscriptionSubagent, warmSubscriptionTranscript} from './subagent-lifecycle.mjs';
const prefixes=['chatgpt-codex/','claude-subscription/'];
function setup(model='chatgpt-codex/test') {
  const parentAbort=new AbortController();
  const parent={data:{composerId:'parent',modelConfig:{modelName:model},chatGenerationUUID:'turn'}};
  const child={data:{composerId:'child',subagentInfo:{parentComposerId:'parent'}}};
  const handles=new Map([['parent',parent],['child',child]]),cancelled=[];
  const service={_composerDataService:{getHandleIfLoaded:id=>handles.get(id),getComposerData:h=>h.data,
    updateComposerDataSetStore(h,fn){fn((k,v)=>h.data[k]=v);}},
    _aiService:{streamingAbortControllers:new Map([['turn',parentAbort]])},
    _terminationReasonByComposerId:new Map(),cancelSubagentTree:id=>cancelled.push(id)};
  return {service,parentAbort,parent,child,handles,cancelled,request:{modelId:model,parentConversationId:'parent'}};
}
for(const model of ['chatgpt-codex/test','claude-subscription/opus']) {
  test(model+': an already cancelled parent never starts inference',async()=>{
    const f=setup(model);f.parentAbort.abort();let starts=0;
    f.service._subscriptionNativeRunSubagent=()=>starts++;
    const result=await runSubscriptionSubagent(f.service,f.request,f.child,{},prefixes);
    assert.equal(starts,0);assert.equal(result.terminationReason,'aborted');
    assert.equal(f.child.data.status,'aborted');assert.deepEqual(f.cancelled,['child']);
  });
  test(model+': a parent stop reaches a running background child synchronously',async()=>{
    const f=setup(model);let received;
    const separateBackgroundSignal=new AbortController();
    f.service._subscriptionNativeRunSubagent=req=>new Promise(resolve=>{
      received=req.abortSignal;req.abortSignal.addEventListener('abort',()=>resolve('cancelled'),{once:true});
    });
    const run=runSubscriptionSubagent(f.service,{...f.request,abortSignal:separateBackgroundSignal.signal},f.child,{},prefixes);
    f.parentAbort.abort();assert.equal(received.aborted,true);assert.equal(await run,'cancelled');
    assert.equal(separateBackgroundSignal.signal.aborted,false);
  });
  test(model+': stop during creation cancels the late child, a new turn remains usable',async()=>{
    const f=setup(model);let finish;
    f.service._subscriptionNativeCreateSubagent=()=>new Promise(resolve=>finish=resolve);
    const creating=createSubscriptionSubagent(f.service,f.request,prefixes);
    f.parentAbort.abort();finish(f.child);
    await assert.rejects(creating,{name:'AbortError'});assert.deepEqual(f.cancelled,['child']);
    const next=new AbortController();f.service._aiService.streamingAbortControllers.set('turn',next);
    f.service._subscriptionNativeRunSubagent=async req=>({success:!req.abortSignal.aborted});
    assert.equal((await runSubscriptionSubagent(f.service,f.request,f.child,{},prefixes)).success,true);
  });
}
test('unrelated models retain native request and options identities',async()=>{
  const f=setup('cursor-model'),options={native:true};
  f.parentAbort.abort();f.service._subscriptionNativeRunSubagent=async(req,h,o)=>{
    assert.equal(req,f.request);assert.equal(h,f.child);assert.equal(o,options);return 'native';
  };
  assert.equal(await runSubscriptionSubagent(f.service,f.request,f.child,options,prefixes),'native');
});
test('ownership follows parent lineage, is cycle safe and respects installed providers',()=>{
  const f=setup('claude-subscription/opus');
  assert.equal(subscriptionComposer(f.service._composerDataService,'child',['chatgpt-codex/']),false);
  assert.equal(subscriptionComposer(f.service._composerDataService,'child',prefixes),true);
  f.parent.data.modelConfig={};f.parent.data.subagentInfo={parentComposerId:'child'};
  assert.equal(subscriptionComposer(f.service._composerDataService,'child',prefixes),false);
});
test('re-attaching a transcript hydrates a bounded tail once and preserves live messages',async()=>{
  const f=setup(),data=f.child.data;let loads=0,notified=0,release;
  data.fullConversationHeadersOnly=Array.from({length:100},(_,i)=>({bubbleId:String(i)}));
  const live={text:'Live output'};data.conversationMap={'99':live};
  const source={composerId:'child',composerHandle:f.child,composerDataService:f.service._composerDataService,
    loadBubbles:async ids=>{loads++;assert.equal(ids.length,63);assert.equal(ids[0],'36');await new Promise(r=>release=r);for(const id of ids)data.conversationMap[id]={text:'Persisted output'};},
    notifyBubbleListeners:()=>notified++};
  const work=warmSubscriptionTranscript(source,prefixes);warmSubscriptionTranscript(source,prefixes);
  await Promise.resolve();assert.equal(loads,1);release();await work;
  assert.equal(data.conversationMap['99'],live);assert.equal(notified,63);
  delete data.conversationMap['98'];
  const again=warmSubscriptionTranscript(source,prefixes);source.__subscriptionDisposed=true;await again;
  assert.equal(loads,1);assert.equal(notified,63);
});
test('repeated completed children do not accumulate parent abort listeners',async()=>{
  const f=setup();f.service._subscriptionNativeRunSubagent=async()=>({success:true});
  const before=getEventListeners(f.parentAbort.signal,'abort').length;
  for(let i=0;i<100;i++)await runSubscriptionSubagent(f.service,f.request,f.child,{},prefixes);
  assert.equal(getEventListeners(f.parentAbort.signal,'abort').length,before);
});

function lifecycleFixture(untrack) {
  return [
    'cancelChat(e){const t=this.composerDataService;if(subscriptionComposer(this.composerDataService,e,__subscriptionSubagentPrefixes))this.instantiationService.invokeFunction(s=>s.get(pZe)).cancelSubagentTree(e);}',
    'async cancelCurrentStep(){}',
    'async stopSubagentTree(e){if(subscriptionComposer(this._composerDataService,e,__subscriptionSubagentPrefixes)){this.cancelSubagentTree(e);return;}}',
    'async _loadSubagentTreeForStop(){}',
    'classifyBubble(id){const map='+untrack+'(()=>this.composerHandle.data.conversationMap);return map&&map[id]?{bubble:map[id]}:{status:"unloaded"};}',
    'getBubbleLoadState(){}'
  ].join('\n');
}
for (const untrack of ['rr','hs']) {
  test('native lifecycle check binds 3.22.12 classifyBubble untrack '+untrack, async () => {
    await verifySubagentLifecycle(lifecycleFixture(untrack), ['claude-subscription/']);
  });
}
