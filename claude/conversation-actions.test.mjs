import test from 'node:test';
import assert from 'node:assert/strict';
import {createSubscriptionActionChannel, runSubscriptionActions, subscriptionActionReceiver, prependSubscriptionPlanMessages} from './conversation-actions.mjs';

const encode=value=>new TextEncoder().encode(JSON.stringify(value));
const decode=bytes=>JSON.parse(new TextDecoder().decode(bytes));
const action=(id,text=id)=>({action:{case:'userMessageAction',value:{userMessage:{messageId:id,text,selectedContext:{images:['image-blob']}}}},toBinary(){return encode({action:this.action});}});
const context=()=>({signal:new AbortController().signal});

// Acknowledged async stream, including the native manager's replay behavior.
export class Manager {
  pending=[]; unprocessed=[]; open=true;
  async submitConversationAction(value){
    if(!this.open)throw Error('closed');
    if(value.action.case==='userMessageAction')this.unprocessed.push(value);
    return new Promise(resolve=>{this.pending.push({value,resolve});this.wake?.();});
  }
  async run(ctx,writer){
    while(this.open||this.pending.length){
      const item=this.pending.shift();
      if(!item){await new Promise(resolve=>{this.wake=resolve;});continue;}
      try{await writer.write(item.value);}catch{}finally{item.resolve();}
    }
  }
  close(){this.open=false;this.wake?.();}
  reopen(){this.open=true;for(const value of [...this.unprocessed])this.submitConversationAction(value);}
  markMessageAsProcessed(message){this.unprocessed=this.unprocessed.filter(a=>a.action.value.userMessage.messageId!==message.messageId);}
}

export async function probeActionQueue(manager=new Manager()){
  const ctx=context(),prepared=[];
  const channel=createSubscriptionActionChannel(manager,ctx,async a=>prepared.push(a.action.case));
  const receiver=subscriptionActionReceiver({async getBlob(ctx,key){return (await channel.read(key)).bytes;}},channel.key,decode,{});
  try{
    await manager.submitConversationAction(action('online-status','Also port the online status'));
    const build={action:{case:'executePlanAction',value:{planId:'plan'}},toBinary(){return encode({action:this.action});}};
    await manager.submitConversationAction(build);
    assert.equal((await receiver.peek(ctx)).action.value.userMessage.text,'Also port the online status');
    assert.deepEqual(await receiver.peek(ctx),await receiver.pop(ctx));
    assert.equal((await receiver.pop(ctx)).action.case,'executePlanAction');
    assert.equal(await receiver.peek(ctx),undefined);
    assert.deepEqual(prepared,['userMessageAction','executePlanAction']);
    assert.equal(await channel.read(encode('ordinary-blob')),undefined);
  }finally{channel.dispose();}
}

test('binary callback delivers queued follow-up then Build in order',()=>probeActionQueue());
test('reopening after a final-peek race does not duplicate accepted messages',async()=>{
  const manager=new Manager(),ctx=context(),channel=createSubscriptionActionChannel(manager,ctx,async()=>{});
  try{
    await manager.submitConversationAction(action('first'));
    await channel.seal();channel.reopen();await channel.settle();
    assert.equal(channel.queue.length,1);
    await manager.submitConversationAction(action('second'));
    assert.deepEqual(channel.queue.map(a=>a.action.value.userMessage.messageId),['first','second']);
  }finally{channel.dispose();}
});
test('cancel clears queued work and prevents more reads',async()=>{
  const controller=new AbortController(),ctx={signal:controller.signal},manager=new Manager();
  const channel=createSubscriptionActionChannel(manager,ctx,async()=>{});
  await manager.submitConversationAction(action('pending'));
  controller.abort();
  assert.equal(channel.queue.length,0);
  await assert.rejects(channel.read(new TextEncoder().encode(channel.key+':pop')),{name:'AbortError'});
  channel.dispose();
});
test('action preparation errors propagate instead of acknowledging model delivery',async()=>{
  const manager=new Manager(),ctx=context(),channel=createSubscriptionActionChannel(manager,ctx,async()=>{throw Error('attachment unavailable');});
  await manager.submitConversationAction(action('attachment'));
  await assert.rejects(channel.settle(),/attachment unavailable/);
  assert.equal(channel.queue.length,0);
  assert.equal(manager.unprocessed.length,1);
  channel.dispose();
});
test('receiver preserves native fallback and isolates channel keys',async()=>{
  const fallback={};assert.equal(subscriptionActionReceiver({},undefined,decode,fallback),fallback);
  const ctx=context(),manager=new Manager(),channel=createSubscriptionActionChannel(manager,ctx,async()=>{});
  assert.equal(await channel.read(new TextEncoder().encode('subscription-actions:another:pop')),undefined);
  channel.dispose();
});
test('concurrent peeks share one read, pop advances once',async()=>{
  let reads=0;const ctx=context(),bytes=action('one').toBinary();
  const receiver=subscriptionActionReceiver({async getBlob(){reads++;await Promise.resolve();return bytes;}},'subscription-actions:test',decode,{});
  const [first,second]=await Promise.all([receiver.peek(ctx),receiver.peek(ctx)]);
  assert.deepEqual(first,second);assert.equal(reads,1);
  assert.deepEqual(await receiver.pop(ctx),first);assert.equal(reads,2);
});

function harness(manager,run){
  const ctx=context(),updates=[],checkpoints=[],ordinary=[];
  const args=[ctx,{turns:[]},action('initial'),{modelId:'chatgpt-codex/test'},
    {async sendUpdate(ctx,event){updates.push(event.message.case);}},
    {async getBlob(ctx,key){ordinary.push(key);return encode('file');}},
    {async handleCheckpoint(ctx,state){checkpoints.push(state);}},[],{},
    {requestedModel:{modelId:'chatgpt-codex/test'}},manager];
  return {args,updates,checkpoints,ordinary,service:{_subscriptionNativeLocalAgent:run}};
}
test('follow-up at turnEnded resumes latest checkpoint before final completion',async()=>{
  const manager=new Manager();let runs=0;const observed=[];
  const h=harness(manager,async(ctx,state,initial,model,listener,blobs,checkpoints)=>{
    runs++;observed.push([initial.action.value.userMessage.messageId,state.turns.length]);
    await checkpoints.handleCheckpoint(ctx,{turns:[...state.turns,initial]});
    if(runs===1)await manager.submitConversationAction(action('late'));
    await listener.sendUpdate(ctx,{message:{case:'turnEnded'}});
  });
  await runSubscriptionActions(h.service,h.args,['chatgpt-codex/'],async()=>{});
  assert.deepEqual(observed,[['initial',0],['late',1]]);
  assert.deepEqual(h.updates,['turnEnded']);assert.equal(manager.open,false);
});
test('running engine consumes queued messages with attachments through ordinary blob callback',async()=>{
  const manager=new Manager();let received;
  const h=harness(manager,async(ctx,state,initial,model,listener,blobs,checkpoints,mcp,resources,opts)=>{
    await manager.submitConversationAction(action('queued'));
    const receiver=subscriptionActionReceiver(blobs,opts.subscriptionActionChannel,decode,{});
    received=await receiver.pop(ctx);
    assert.equal(decode(await blobs.getBlob(ctx,encode('file-key'))),'file');
    await listener.sendUpdate(ctx,{message:{case:'userMessageAppended'}});
    await listener.sendUpdate(ctx,{message:{case:'turnEnded'}});
  });
  await runSubscriptionActions(h.service,h.args,['chatgpt-codex/'],async()=>{});
  assert.deepEqual(received.action.value.userMessage.selectedContext,{images:['image-blob']});
  assert.deepEqual(h.updates,['userMessageAppended','turnEnded']);assert.equal(h.ordinary.length,1);
});
test('ordinary Cursor models keep the original arguments and manager untouched',async()=>{
  const manager=new Manager();let passed;const h=harness(manager,async(...args)=>{passed=args;});
  h.args[9].requestedModel.modelId='cursor-model';
  await runSubscriptionActions(h.service,h.args,['chatgpt-codex/'],async()=>{throw Error('unexpected');});
  assert.deepEqual(passed,h.args);assert.equal(manager.open,true);
});
test('stopping before follow-up restart prevents a second model run',async()=>{
  const manager=new Manager(),controller=new AbortController();let runs=0;
  const h=harness(manager,async()=>{runs++;await manager.submitConversationAction(action('pending'));controller.abort();});
  h.args[0]={signal:controller.signal};
  await assert.rejects(runSubscriptionActions(h.service,h.args,['chatgpt-codex/'],async()=>{}),{name:'AbortError'});
  assert.equal(runs,1);
});
test('Build records missing human messages once before kickoff, preserving native content',async()=>{
  const ctx=context(),turns=[{messageId:'existing'}],notifications=[];
  const state={async findUserTurnMessageIds(){return new Set(turns.map(t=>t.messageId));},async createAgentTurn(ctx,message){turns.push(message);}};
  const message=action('queued','Also port online status').action.value.userMessage;
  await prependSubscriptionPlanMessages([{messageId:'existing'},message,message],ctx,state,{}, {}, {},async m=>notifications.push(m));
  await state.createAgentTurn(ctx,{messageId:'kickoff',text:'Implement plan'});
  assert.deepEqual(turns.map(t=>t.messageId),['existing','queued','kickoff']);
  assert.equal(turns[1],message);assert.deepEqual(notifications,[message]);
});

