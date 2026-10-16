import {requireSubscriptionPrefix} from './subscription-prefix.mjs';

export function claudeTurnStrategy(strategy,localStrategy,prefix,isIndependentHost) {
 return new Proxy(strategy,{
  get(target,key){
   if(key==='executeTurn')return turn=>{
    const model=turn.runOptions?.requestedModel?.modelId??turn.modelDetails?.modelId;
    if(typeof model==='string'&&model.startsWith(prefix)){
     if(isIndependentHost())return Promise.reject(new Error("Subscription models are temporarily unsupported in Cursor's independent Agent Host runtime."));
     return localStrategy.executeTurn(turn);
    }
    return target.executeTurn(turn);
   };
   const value=Reflect.get(target,key,target);
   return typeof value==='function'?value.bind(target):value;
  }
 });
}

export function patchAgentHostRouting(source,prefix) {
 requireSubscriptionPrefix(prefix);
 const matches=[...source.matchAll(/([\w$]+)\?\.executionStrategy\?\?new ([\w$]+)\(this\.agentClientService\)/g)];
 if(matches.length!==1)throw new Error('AgentCompat execution strategy anchor is not unique');
 if(source.includes('function __ClaudeTurnStrategy('))throw new Error('Claude AgentCompat routing is already patched');
 const match=matches[0];
 const guard='()=>'+match[1]+'?.executionStrategy!=null&&(this.experimentService.checkFeatureGate("cursor_agent_host_move_exec",{disableExposureLog:!0})||this.experimentService.checkFeatureGate("agent_host_local_loop",{disableExposureLog:!0}))';
 const replacement='__ClaudeTurnStrategy('+match[0]+',new '+match[2]+'(this.agentClientService),'+JSON.stringify(prefix)+','+guard+')';
 return source.replace(match[0],replacement)+'\n'+claudeTurnStrategy.toString().replace('function claudeTurnStrategy','function __ClaudeTurnStrategy')+'\n';
}
