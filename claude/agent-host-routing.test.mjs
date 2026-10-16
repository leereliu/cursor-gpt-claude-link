import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {patchLocalBridgeMode} from './patch-runtime.mjs';

const surface={run:'async run(e,t,n,i,r,s,o,a,c,l,u){const h=a6d(u,',local:'zc'};
// Snapshot of cursor-gpt-link/src/agent-host-routing.mjs keeps the GPT-first
// fixture faithful without requiring a companion checkout at test time.
function __ChatgptTurnStrategy(strategy, local, prefix, isIndependentHost) {
  return new Proxy(strategy, {
    get(target, property) {
      if (property === 'executeTurn') return turn => {
        const model = turn.runOptions?.requestedModel?.modelId ?? turn.modelDetails?.modelId;
        if (typeof model !== 'string' || !model.startsWith(prefix)) return target.executeTurn(turn);
        if (isIndependentHost()) return Promise.reject(new Error("Subscription models are temporarily unsupported in Cursor's independent Agent Host runtime."));
        return local.executeTurn(turn);
      };
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}

function constructorFixture(options,legacy,combined) {
 const source=`class ${legacy}{constructor(client){this.agentClientService=client}executeTurn(e){return this.agentClientService.run(e.ctx,e.conversationState,e.action,e.modelDetails,e.interactionListener,e.resourceAccessor,e.blobStore,e.conversationActionManager,e.checkpointHandler,e.mcpTools,e.runOptions)}}
function en(fn){return {dispose:fn}}
class Compat{constructor(${options},client,experimentService={checkFeatureGate:()=>false}){this.agentClientService=client,this.experimentService=experimentService,this._executionStrategy=${options}?.executionStrategy??new ${legacy}(this.agentClientService),this._register(en(()=>this._executionStrategy.dispose?.()))}
_register(cleanup){this.cleanup=cleanup}
runAgentLoop(turn){return this._executionStrategy.executeTurn(turn)}
resume(turn){return this._executionStrategy.executeTurn(turn)}
summarize(turn){return this._executionStrategy.executeTurn(turn)}}
class Client{async run(e,t,n,i,r,s,o,a,c,l,u){${combined?'const __chatgptLocal=__isChatgptBridgeModel(u?.requestedModel?.modelId??i?.modelId);':''}const h=a6d(u,{localMode:zc.localMode});if(zc.localMode){return h}return h}}`;
 if(!combined)return source;
 const anchor=options+'?.executionStrategy??new '+legacy+'(this.agentClientService)';
 const independentHost='()=>'+options+'?.executionStrategy!=null&&(this.experimentService.checkFeatureGate("cursor_agent_host_move_exec",{disableExposureLog:!0})||this.experimentService.checkFeatureGate("agent_host_local_loop",{disableExposureLog:!0}))';
 return __ChatgptTurnStrategy.toString()+'\n'+source.replace(anchor,'__ChatgptTurnStrategy('+anchor+',new '+legacy+'(this.agentClientService),"chatgpt-codex/",'+independentHost+')');
}

for(const [options,legacy] of [['e','W6d'],['t','sdm']]){
 test(`${legacy}: independent Agent Host rejects only subscription turns before any dispatch`,async()=>{
  for(const combined of [false,true]){
  const Compat=new Function(patchLocalBridgeMode(constructorFixture(options,legacy,combined),surface)+';return Compat;')();
  const prefixes=combined?['claude-subscription/','chatgpt-codex/']:['claude-subscription/'];
  for(const [moveExec,localLoop] of [[true,false],[false,true],[true,true]]){
   const hostCalls=[],localCalls=[],gates=[];
   const hostResult=Promise.resolve('host'),localResult=Promise.resolve('local');
   const host={executeTurn(turn){hostCalls.push(turn);return hostResult}};
   const client={run(...args){localCalls.push(args);return localResult}};
   const experimentService={checkFeatureGate(gate,gateOptions){assert.equal(gateOptions.disableExposureLog,true);gates.push(gate);return gate==='cursor_agent_host_move_exec'?moveExec:localLoop}};
   const compat=new Compat({executionStrategy:host},client,experimentService);
   for(const method of ['runAgentLoop','resume','summarize'])for(const prefix of prefixes){
    for(const turn of [{modelDetails:{modelId:prefix+'test'}},{modelDetails:{modelId:'ordinary'},runOptions:{requestedModel:{modelId:prefix+'test'}}}]){
     await assert.rejects(compat[method](turn),/Subscription models are temporarily unsupported/);
     assert.equal(hostCalls.length,0);assert.equal(localCalls.length,0);
    }
   }
   gates.length=0;
   for(const requested of ['ordinary','default',combined?'foreign/test':'chatgpt-codex/test',undefined]){
    const turn={modelDetails:{modelId:requested===undefined?undefined:'claude-subscription/haiku'},runOptions:{requestedModel:requested===undefined?undefined:{modelId:requested}}};
    assert.equal(compat.runAgentLoop(turn),hostResult);assert.equal(hostCalls.at(-1),turn);
   }
   assert.deepEqual(gates,[],'Other models do not evaluate the subscription compatibility guard');
   for(const initialOptions of [undefined,{},{executionStrategy:null}])for(const prefix of prefixes){
    const native=new Compat(initialOptions,client,experimentService);
    assert.equal(native.runAgentLoop({modelDetails:{modelId:prefix+'test'}}),localResult);
   }
   assert.deepEqual(gates,[],'Native fallback does not evaluate independent host gates');
  }
  }
 });
}

for(const [options,legacy] of [['e','W6d'],['t','sdm']])for(const combined of [false,true]){
 test(`${legacy}: all AgentCompat turn entrypoints route Claude locally with an injected host (${combined?'combined':'standalone'})`,()=>{
  const patched=patchLocalBridgeMode(constructorFixture(options,legacy,combined),surface);
  execFileSync(process.execPath,['--check','--input-type=module'],{input:patched,stdio:'pipe'});
  const Compat=new Function(patched+';return Compat;')();
  const hostResult=Promise.resolve('host'),localResult=Promise.resolve('local');
  const hostCalls=[],localCalls=[];
  class Host {
   #disposed=false;
   disposals=0;
   executeTurn(turn){assert.equal(this.#disposed,false);hostCalls.push(turn);return hostResult}
   dispose(){this.#disposed=true;this.disposals++}
   get disposed(){return this.#disposed}
  }
  const host=new Host(),client={run(...args){assert.equal(this,client);localCalls.push(args);return localResult}};
  const compat=new Compat({executionStrategy:host},client);
  for(const method of ['runAgentLoop','resume','summarize'])for(const [requested,fallback,local] of [
   ['claude-subscription/haiku','ordinary',true],
   [undefined,'claude-subscription/haiku',true],
   ['ordinary','claude-subscription/haiku',false],
   ['default','claude-subscription/haiku',false],
   [undefined,undefined,false],
   ['chatgpt-codex/test',undefined,combined],
   [undefined,'chatgpt-codex/test',combined],
   ['ordinary','chatgpt-codex/test',false],
   ['default','chatgpt-codex/test',false],
   ['claude-subscription/haiku','chatgpt-codex/test',true],
   ['chatgpt-codex/test','claude-subscription/haiku',combined]
  ]){
   const turn={ctx:{signal:AbortSignal.abort()},conversationState:{},action:{},modelDetails:{modelId:fallback},interactionListener:{},resourceAccessor:{},blobStore:{},conversationActionManager:{},checkpointHandler:{},mcpTools:[],runOptions:{requestedModel:requested===undefined?undefined:{modelId:requested}}};
   const hostCount=hostCalls.length,localCount=localCalls.length;
   assert.equal(compat[method](turn),local?localResult:hostResult);
   assert.equal(hostCalls.length,hostCount+(local?0:1));assert.equal(localCalls.length,localCount+(local?1:0));
   if(local)[turn.ctx,turn.conversationState,turn.action,turn.modelDetails,turn.interactionListener,turn.resourceAccessor,turn.blobStore,turn.conversationActionManager,turn.checkpointHandler,turn.mcpTools,turn.runOptions].forEach((arg,index)=>assert.equal(localCalls.at(-1)[index],arg));
   else assert.equal(hostCalls.at(-1),turn);
  }
  compat.cleanup.dispose();assert.equal(compat._executionStrategy.disposed,true);assert.equal(host.disposals,1);
  const native=new Compat(undefined,client),turn={runOptions:{requestedModel:{modelId:'ordinary'}}};
  assert.equal(native.runAgentLoop(turn),localResult);
 });
}
