import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pickerModel,providerModel} from '../src/bridge.mjs';
const source=fs.readFileSync(path.join(process.argv[2]||'resources/app','out/vs/workbench/workbench.glass.main.js'),'utf8');
const anchor=source.indexOf('const n=t.modelConfig?.selectedModels;if(!n||n.length!==1)return;');
assert.ok(anchor>0);
const begin=source.lastIndexOf('function ',anchor),name=source.slice(begin,anchor).match(/function ([\w$]+)/)[1];
const moduleEnd=source.indexOf('var ',anchor);
const contextStart=source.lastIndexOf('function ',source.lastIndexOf('if(t.contextTokensUsed!==0)return;',anchor));
const body=source.slice(contextStart,moduleEnd);
const percent=body.match(/function ([\w$]+)\(t,e\)\{if\(!t\)return;const n=[\w$]+\(t,e\);return n!==void 0\?n.used\/n.limit\*100/)[1];
const api=new Function(body+';return {limit:'+name+',percent:'+percent+'};')();
const entry={slug:'fixture',display_name:'Fixture',description:'Synthetic model',context_window:272000,max_context_window:872000,supports_experimental_context:false,default_reasoning_level:'medium',supported_reasoning_levels:[{effort:'medium'},{effort:'xhigh'}]};
const model=pickerModel(entry),models=[model];
assert.equal(model.contextTokenLimit,272000);
assert.equal(model.contextTokenLimitForMaxMode,500000);
const chat=context=>({contextTokensUsed:162600,contextTokenLimit:272000,modelConfig:{maxMode:true,selectedModels:[{modelId:model.name,parameters:[{id:'context',value:String(context)},{id:'reasoning',value:'xhigh'}]}]}});
const old=models.map(m=>({...m,contextTokenLimit:272000,contextTokenLimitForMaxMode:undefined}));
assert.equal(api.limit(chat(500000),old),272000,'Reproduce stale 272K display with the old catalog');
for(const context of [272000,500000,272000]){
 assert.equal(api.limit(chat(context),models),context);
 assert.equal(api.percent(chat(context),models),162600/context*100);
}
assert.equal(providerModel(entry).capabilities.context_length,500000);
console.log('Native Agents Window: old 272K display reproduced; 272K/500K/272K switching and percentages corrected, runtime capacity retained.');
