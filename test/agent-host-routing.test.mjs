import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatgptExecutionStrategy, patchAgentHostRouting, patchSharedLocalProvider} from '../src/agent-host-routing.mjs';

test('Agent Host rejects the private model before the repair; subscription turns use the local runtime after it', async () => {
  const calls = [];
  const host = {executeTurn(turn) { calls.push(['host', turn]); if (turn.runOptions?.requestedModel?.modelId?.startsWith('chatgpt-codex/')) throw new Error('Unknown model ID'); return 'host-ok'; }};
  const local = {executeTurn(turn) { calls.push(['local', turn]); return 'local-ok'; }};
  const turn = {modelDetails:{modelId:'default'},runOptions:{requestedModel:{modelId:'chatgpt-codex/gpt-6.1-sol',parameters:[{id:'fast',value:'true'},{id:'context',value:'500000'}]}},action:{case:'userMessageAction'},conversationState:{turns:['prior']},resourceAccessor:{worktree:'/synthetic'}};
  assert.throws(() => host.executeTurn(turn), /Unknown model ID/);
  calls.length = 0;
  const routed = createChatgptExecutionStrategy(host,local);
  for (const kind of ['userMessageAction','resumeAction','summarizeAction','executePlanAction']) {
    const request = {...turn,action:{case:kind}};
    assert.equal(await routed.executeTurn(request),'local-ok');
    assert.deepEqual(calls.at(-1),['local',request]);
    assert.equal(calls.at(-1)[1],request,'state, tools, actions and selected parameters retain identity');
  }
  assert.ok(calls.every(([kind]) => kind === 'local'));
  for (const id of ['ordinary-model','claude-subscription/model',undefined]) {
    const request = {modelDetails:{modelId:id}};
    assert.equal(await routed.executeTurn(request),'host-ok');
    assert.equal(calls.at(-1)[0],'host');
  }
  assert.equal(await routed.executeTurn({modelDetails:{modelId:'chatgpt-codex/gpt-6-sol'}}),'local-ok');
  assert.equal(await routed.executeTurn({modelDetails:{modelId:'chatgpt-codex/old'},runOptions:{requestedModel:{modelId:'ordinary-model'}}}),'host-ok');
});

test('local failure never falls back to Cursor; cancellation and disposal survive', async () => {
  const error = new Error('cancelled');let hostCalls=0,disposed=[];
  const host={executeTurn(){hostCalls++},dispose(){disposed.push('host')}};
  const local={executeTurn(){throw error},dispose(){disposed.push('local')}};
  const route=createChatgptExecutionStrategy(host,local);
  assert.throws(()=>route.executeTurn({modelDetails:{modelId:'chatgpt-codex/test'}}),e=>e===error);
  assert.equal(hostCalls,0);route.dispose();assert.deepEqual(disposed,['host','local']);
  assert.equal(createChatgptExecutionStrategy(undefined,local),local);
});

test('patch is exact, idempotent and fails closed on changed or ambiguous constructors', () => {
  const original='class Service{constructor(t){this.agentClientService=t;this._executionStrategy=t?.executionStrategy??new Local(this.agentClientService)}}';
  const patched=patchAgentHostRouting(original);
  assert.equal(patchAgentHostRouting(patched),patched);
  const Local=class{constructor(client){this.client=client}executeTurn(t){return ['local',t,this.client]}};
  const Service=new Function('Local',patched+';return Service')(Local);
  const host={executeTurn:t=>['host',t]};const instance=new Service({executionStrategy:host});
  assert.equal(instance._executionStrategy.executeTurn({modelDetails:{modelId:'chatgpt-codex/model'}})[0],'local');
  assert.equal(instance._executionStrategy.executeTurn({modelDetails:{modelId:'ordinary'}})[0],'host');
  assert.throws(()=>patchAgentHostRouting('changed'),/anchor/);
  assert.throws(()=>patchAgentHostRouting(original+original),/anchor/);
});


test('shared host runtime also registers the local provider, retaining other activation options', () => {
  const original='register(context,options,{factory:factory,teamSettingsService:team})';
  const calls=[];const register=(context,options,deps)=>{calls.push({context,options,deps});return options.registerAgentExecProvider!==false};
  const context={subscriptions:[]},options={registerAgentExecProvider:false,runtimeExtensionPath:'/synthetic'},factory={},team={};
  const run=source=>new Function('register','context','options','factory','team','return '+source)(register,context,options,factory,team);
  assert.equal(run(original),false,'reproduces absent legacy provider under Agent Host');
  const patched=patchSharedLocalProvider(original);
  assert.equal(run(patched),true);
  assert.equal(calls.at(-1).context,context);assert.equal(calls.at(-1).deps.factory,factory);
  assert.equal(calls.at(-1).options.runtimeExtensionPath,options.runtimeExtensionPath);
  assert.equal(options.registerAgentExecProvider,false,'caller options remain unchanged');
  assert.equal(patchSharedLocalProvider(patched),patched);
  assert.throws(()=>patchSharedLocalProvider('changed'),/anchor/);
});
