import assert from 'node:assert/strict';

export async function verifyAgentHostRouting(source,prefixes=['claude-subscription/']) {
 const gateStart=source.search(/checkFeatureGate\([\w$]+,[\w$]+\)\{if\(![\w$]+\.doNotUseIgnoreLocalOverridesExceptForDeveloperOverrideUi/);
 const gateEnd=source.indexOf('}_checkGateWithoutOverride(',gateStart)+1;
 assert.ok(gateStart>=0&&gateEnd>gateStart,'Native renderer feature-gate method found');
 const checkFeatureGate=new Function('return ({'+source.slice(gateStart,gateEnd)+'}).checkFeatureGate;')();
 const experiment=(values={},calls=[])=>({checkFeatureGate,_featureFlagOverrides:new Map(),_canUseOverrides:()=>false,_systemGateValues:new Map(),
  _checkGateWithoutOverride(gate,options){assert.deepEqual(options,{disableExposureLog:true});calls.push(gate);return values[gate]??false}});
 assert.throws(()=>experiment().checkFeatureGate('cursor_agent_host_move_exec'),{name:'TypeError'},'Native renderer requires an options argument');
 const marker='this._executionStrategy=',start=source.indexOf(marker);
 const end=source.indexOf(',this._register(',start);
 assert.ok(start>=0&&end>start,'AgentCompat strategy constructor found');
 const expression=source.slice(start+marker.length,end);
 const fallback=expression.match(/([\w$]+)\?\.executionStrategy\?\?new ([\w$]+)\(this\.agentClientService\)/);
 assert.ok(fallback,'Native local strategy fallback retained');
 const nativeStart=source.indexOf(fallback[2]+'=class{'),nativeEnd=source.indexOf('},',nativeStart)+1;
 assert.ok(nativeStart>=0&&nativeEnd>nativeStart,'Native local execution strategy found');
 const native=source.slice(nativeStart+fallback[2].length+1,nativeEnd);
 const helpers=[...source.matchAll(/function __(?:Claude|Chatgpt)TurnStrategy\([\s\S]*?\n}/g)].map(match=>match[0]);
 assert.equal(helpers.length,prefixes.length,'One strategy wrapper per installed provider');
 const build=new Function(fallback[1],'client','experimentService',helpers.join('\n')+'\nconst '+fallback[2]+'='+native+';return (function(){this.agentClientService=client;this.experimentService=experimentService;return '+expression+'}).call({});');
 const make=(options,client,experimentService=experiment())=>build(options,client,experimentService);
 const compatEnd=source.indexOf('=__decorate(',end),compat=source.slice(end,compatEnd);
 assert.equal(compat.split('this._executionStrategy.executeTurn(').length-1,3,'Initial, resumed and summarize turns share the selected strategy');
 const calls=[],hostResult=Promise.resolve('host'),localResult=Promise.resolve('local');
 class Host {
  #disposed=false;
  executeTurn(turn){assert.equal(this.#disposed,false);calls.push(['host',turn]);return hostResult}
  dispose(){this.#disposed=true}
  get disposed(){return this.#disposed}
 }
 const host=new Host(),client={run(...args){calls.push(['local',args]);return localResult}};
 const strategy=make({executionStrategy:host},client);
 const cases=prefixes.flatMap(prefix=>[[prefix+'test',undefined,true],[undefined,prefix+'test',true],['ordinary',prefix+'test',false],['default',prefix+'test',false]]);
 cases.push([undefined,undefined,false],['ordinary',undefined,false]);
 for(const [requested,fallbackId,local] of cases){
  const turn={ctx:{signal:AbortSignal.abort()},conversationState:{},action:{},modelDetails:{modelId:fallbackId},interactionListener:{},resourceAccessor:{},blobStore:{},conversationActionManager:{},checkpointHandler:{},mcpTools:[],runOptions:{requestedModel:requested===undefined?undefined:{modelId:requested}}};
  assert.equal(strategy.executeTurn(turn),local?localResult:hostResult);
  if(local){
   const expected=[turn.ctx,turn.conversationState,turn.action,turn.modelDetails,turn.interactionListener,turn.resourceAccessor,turn.blobStore,turn.conversationActionManager,turn.checkpointHandler,turn.mcpTools,turn.runOptions];
   assert.equal(calls.at(-1)[0],'local');
   expected.forEach((arg,index)=>assert.equal(calls.at(-1)[1][index],arg));
  }else{assert.equal(calls.at(-1)[0],'host');assert.equal(calls.at(-1)[1],turn);}
 }
 strategy.dispose();assert.equal(host.disposed,true);
 assert.equal(make(undefined,client).executeTurn({runOptions:{}}),localResult,'Native fallback remains when Agent Host is disabled');
 for(const [moveExec,localLoop] of [[true,false],[false,true],[true,true]]){
  const gateCalls=[],activeHost=new Host();
  const experimentService=experiment({cursor_agent_host_move_exec:moveExec,agent_host_local_loop:localLoop},gateCalls);
  const guarded=make({executionStrategy:activeHost},client,experimentService);
  for(const prefix of prefixes)for(const turn of [{modelDetails:{modelId:prefix+'test'}},{modelDetails:{modelId:'ordinary'},runOptions:{requestedModel:{modelId:prefix+'test'}}}]){
   const before=calls.length;
   await assert.rejects(guarded.executeTurn(turn),/Subscription models are temporarily unsupported/);
   assert.equal(calls.length,before,'Unsupported subscription mode rejects before any native dispatch');
  }
  gateCalls.length=0;
  for(const requested of ['ordinary','default',undefined]){
   const turn={modelDetails:{modelId:requested===undefined?undefined:prefixes[0]+'test'},runOptions:{requestedModel:requested===undefined?undefined:{modelId:requested}}};
   assert.equal(guarded.executeTurn(turn),hostResult);
  }
  assert.deepEqual(gateCalls,[],'Other models do not evaluate the subscription guard');
  for(const options of [undefined,{},{executionStrategy:null}])for(const prefix of prefixes){
   assert.equal(make(options,client,experimentService).executeTurn({modelDetails:{modelId:prefix+'test'}}),localResult);
  }
  assert.deepEqual(gateCalls,[],'Native fallback does not evaluate independent host gates');
  guarded.dispose();assert.equal(activeHost.disposed,true);
 }
 console.log('Native AgentCompat strategy: shared-runtime subscription routing and independent-runtime errors passed; ordinary models, arguments and disposal are preserved.');
}
