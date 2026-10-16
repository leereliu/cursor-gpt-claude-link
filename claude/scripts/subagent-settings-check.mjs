// Execute Cursor's local task configuration with synthetic inputs. Cursor's
// bundled code is read from a local installation and is never redistributed.
import assert from 'node:assert/strict';
import {configureTaskProps,selectedParameters,selectedModelIds} from '../subagent-settings.mjs';
import {CLAUDE_PREFIX} from '../subscription-prefix.mjs';
export function verifySubagentSettings(source) {
 // 3.21.1 rotated the minified locals; the resolver call is what identifies it.
 const match=source.match(/function ([\w$]+)\(e\)\{const t=\(\)=>!1,([\w$]+)=([\w$]+)\(e\),([\w$]+)=null!=\2\?\2:e\.localProvider;/);
 assert.ok(match,'Native local task factory found');
 const tail=source.slice(match.index),end=tail.search(/function [\w$]+\(e\)\{return e instanceof/);
 assert.ok(end>0,'Native local task factory end found');
 const fn=tail.slice(0,end);
 const resolver=fn.match(/[\w$]+=([\w$]+)\("grok-4.5"/)[1];
 const normalize=fn.match(/"explore"===([\w$]+)\(t.subagentType\)/)[1];
 const models=fn.match(/subagentModels:([\w$]+)\([\w$]+,t\)/)[1];
 const policy=fn.match(/subagentModelForcePolicy:([\w$]+),/)[1];
 const dependencies={[match[3]]:e=>e.localProvider,[resolver]:(id,available)=>available.some(m=>m.id===id)?id:undefined,
   [normalize]:value=>value,[models]:models=>({modelsBySlug:new Map(Object.entries(models))}),[policy]:'none'};
 const native=new Function(...Object.keys(dependencies),'return ('+fn+')')(...Object.values(dependencies));
 const parent='claude-subscription/parent',child='claude-subscription/selected',parentParams=[{id:'reasoning',value:'low'}];
 const selectedParams=[{id:'reasoning',value:'xhigh'},{id:'context',value:'1000000'},{id:'fast',value:'true'}];
 const overrides=[{subagentType:'explore',selection:{case:'model',value:{modelId:child,parameters:selectedParams}}}];
 const base={modelId:parent,localProvider:{kind:'http',endpoints:[]},modelParameters:parentParams,subagentModelOverrides:overrides};
 assert.equal(native(base).subagentModelOverrides.explore.type,'inherit','Original missing-catalog failure reproduced');
 const input={...base,availableModels:selectedModelIds([],overrides,parent,CLAUDE_PREFIX).map(modelId=>({modelId}))};
 const props=configureTaskProps(input,native(input),CLAUDE_PREFIX);
 assert.deepEqual(props.subagentModelOverrides.explore,{type:'model',modelId:child});
 assert.deepEqual(props.parentModelParameters,parentParams);
 assert.deepEqual(selectedParameters(props,{subagent_type:{type:{case:'explore'}},userRequestedModelId:child},child,undefined,CLAUDE_PREFIX),selectedParams);
 const foreign=[{subagentType:'explore',selection:{case:'model',value:{modelId:'another-provider/model',parameters:selectedParams}}}];
 assert.deepEqual(selectedModelIds([],foreign,parent,CLAUDE_PREFIX),[]);
 const foreignInput={...base,subagentModelOverrides:foreign,availableModels:selectedModelIds([],foreign,parent,CLAUDE_PREFIX).map(modelId=>({modelId}))};
 assert.equal(native(foreignInput).subagentModelOverrides.explore.type,'inherit');
 for(const mode of ['default','inherit','disabled']){
  const input={modelId:parent,localProvider:{kind:'http'},subagentModelOverrides:mode==='default'?[]:[{subagentType:'explore',selection:{case:mode,value:true}}]};
  const original=native(input),patched=configureTaskProps(input,original,CLAUDE_PREFIX);
  assert.deepEqual(patched.subagentModelOverrides,original.subagentModelOverrides);
  assert.equal(patched.subagentModelOverrides.explore.type,mode==='default'?'inherit':mode);
 }
 assert.match(source,/modelId:([\w$]+)\.modelDetails\.modelId,modelParameters:\1\.parameters,modelInfo:[\w$]+/);
 assert.ok(source.includes('resolvedModelParameters:__ClaudeSelectedParameters(a,'),'Parameters forwarded into client subagent resolution');
 console.log('Native Explore settings: missing catalog reproduced; model, Default, Inherit, Disabled and parameters passed.');
}
