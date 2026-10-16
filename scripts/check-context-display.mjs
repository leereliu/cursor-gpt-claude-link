import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pickerModels,providerModels} from '../models.mjs';
const source=fs.readFileSync(path.join(process.argv[2]||'resources/app','out/vs/workbench/workbench.glass.main.js'),'utf8');
const anchor=source.indexOf('const n=t.modelConfig?.selectedModels;if(!n||n.length!==1)return;');
assert.ok(anchor>0);
const begin=source.lastIndexOf('function ',anchor),name=source.slice(begin,anchor).match(/function ([\w$]+)/)[1];
const moduleEnd=source.indexOf('var ',anchor);
const contextStart=source.lastIndexOf('function ',source.lastIndexOf('if(t.contextTokensUsed!==0)return;',anchor));
const body=source.slice(contextStart,moduleEnd);
const percent=body.match(/function ([\w$]+)\(t,e\)\{if\(!t\)return;const n=[\w$]+\(t,e\);return n!==void 0\?n.used\/n.limit\*100/)[1];
const api=new Function(body+';return {limit:'+name+',percent:'+percent+'};')();
const catalog=[{value:'opus',displayName:'Opus',description:'Opus 5 with 1M context',resolvedModel:'claude-opus-5[1m]',supportedEffortLevels:['medium','xhigh']}];
const models=pickerModels(catalog),model=models[0];
assert.equal(model.contextTokenLimitForMaxMode,1000000);
const chat=context=>({contextTokensUsed:162600,contextTokenLimit:1000000,modelConfig:{maxMode:true,selectedModels:[{modelId:model.name,parameters:[{id:'context',value:String(context)},{id:'reasoning',value:'xhigh'}]}]}});
const old=models.map(m=>({...m,contextTokenLimit:1000000,contextTokenLimitForMaxMode:undefined}));
assert.equal(api.limit(chat(200000),old),1000000,'Reproduce stale 1M display with the old catalog');
for(const context of [200000,1000000,200000]){
 assert.equal(api.limit(chat(context),models),context);
 assert.equal(api.percent(chat(context),models),162600/context*100);
}
assert.equal(providerModels(catalog)[0].capabilities.context_length,1000000);
console.log('Native Agents Window: old 1M display reproduced; 200K/1M/200K switching and percentages corrected, runtime capacity retained.');
