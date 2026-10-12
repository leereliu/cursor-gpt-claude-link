import assert from 'node:assert/strict';
import {maxModeVariant} from '../src/max-mode.mjs';
export function verifyMaxMode(source) {
 const m=source.match(/function ([\w$]+)\(([\w$]+),([\w$]+),([\w$]+)\)\{if\(\2.variants.length===0\|\|!\4&&\2.supportsNonMaxMode===!1\)return;/);
 assert.ok(m,'Native Max-mode solver found');
 const end=source.indexOf('}var ',m.index);assert.ok(end>m.index);
 const fn=source.slice(m.index,end+1);
 const eq=fn.match(/\.variants.find\([\w$]+=>([\w$]+)\(/)[1];
 const def=fn.match(/:([\w$]+)\([\w$]+,\{maxMode:/)[1];
 const same=(variant,params)=>variant.parameterValues.length===params.length&&variant.parameterValues.every(p=>params.some(q=>p.id===q.id&&p.value===q.value));
 const dependencies={[eq]:same,[def]:(model,{maxMode})=>model.variants.find(v=>maxMode?v.isDefaultMaxConfig:v.isDefaultNonMaxConfig),
  __ChatgptMaxModeVariant:maxModeVariant,__ClaudeMaxModeVariant:maxModeVariant};
 const solve=new Function(...Object.keys(dependencies),'return ('+fn+')')(...Object.values(dependencies));
 const model={name:'chatgpt-codex/fixture',supportsMaxMode:true,supportsNonMaxMode:true,
  variants:['low','high'].flatMap(effort=>[false,true].flatMap(fast=>[200000,1000000].map(context=>({
   parameterValues:[{id:'reasoning',value:effort},{id:'fast',value:String(fast)},{id:'context',value:String(context)}],isMaxMode:context>200000,
   isDefaultMaxConfig:effort==='low'&&!fast&&context>200000,isDefaultNonMaxConfig:effort==='low'&&!fast&&context===200000}))))};
 for(const variant of model.variants)for(const maxMode of [false,true]){
  const result=solve(model,variant.parameterValues,maxMode);
  assert.equal(result.variant.isMaxMode,maxMode);
  for(const p of variant.parameterValues.filter(p=>p.id!=='context'))assert.ok(result.parameters.some(q=>q.id===p.id&&q.value===p.value));
  assert.equal(result.parameters.find(p=>p.id==='context').value,maxMode?'1000000':'200000');
 }
 const ordinary={...model,name:'ordinary'};
 assert.equal(solve(ordinary,model.variants.at(-1).parameterValues,false).variant,ordinary.variants.find(v=>v.isDefaultNonMaxConfig));
 console.log('Native Max toggle: context changes; every effort and Fast value survives; ordinary models retain native behavior.');
}
export function verifyContextBudget(source,entry) {
 // Shared by both forms: down-levelled spreads (Object.assign) up to 3.22,
 // native object spreads from 3.24.
 const marker='{modelId:t,apiTypes:';
 // The two runtime bundles order these minified locals differently.
 const pivot=source.indexOf(marker),start=source.lastIndexOf('function(e,t){',pivot),end=pivot+source.slice(pivot).search(/\}\([\w$]+,[\w$]+\)/);
 assert.ok(start>=0&&end>start,'Native model metadata decoder found');
 const fn=source.slice(start,end+1),number=fn.match(/contextLength:([\w$]+)\(/)[1];
 const parse=new Function(number,'return ('+fn+')')(value=>typeof value==='number'&&Number.isFinite(value)&&value>0?Math.floor(value):undefined);
 const metadata=parse(entry,entry.id);assert.equal(metadata.contextLength,entry.capabilities.context_length);
 assert.equal(parse({id:entry.id,context_window:metadata.contextLength},entry.id).contextLength,undefined,'Old top-level field was ignored');
 // Up to 3.22: p=null!==(n=i.contextLength)&&void 0!==n?n:…,m=void 0!==h?Math.min(h,null!=p?p:h):p
 // From 3.24:  l=n.contextLength??…,d=void 0!==u?Math.min(u,l??u):l   (metadata no longer named i)
 const legacy=source.match(/([\w$]+)=null!\=\=\(([\w$]+)=i.contextLength\)[\s\S]{0,2000}?,([\w$]+)=void 0!==([\w$]+)\?Math.min\(\4,null!=\1\?\1:\4\):\1/);
 const nativeForm=legacy?null:source.match(/([\w$]+)=([\w$]+)\.contextLength\?\?[\s\S]{0,2000}?,([\w$]+)=void 0!==([\w$]+)\?Math\.min\(\4,\1\?\?\4\):\1/);
 const m=legacy??nativeForm;
 assert.ok(m,'Native context budget found');
 const budgeted=m[3];
 const catalog=m[0].match(/of ([\w$]+).values\(\)/)[1],key=m[0].match(/e.id===([\w$]+)/)[1];
 const budget=legacy
   ?new Function('i','e',catalog,key,'var '+m[2]+';const '+m[0]+';return '+budgeted+';')
   :new Function(m[2],'e',catalog,key,'const '+m[0]+';return '+budgeted+';');
 for(const requested of [Math.min(200000,metadata.contextLength),metadata.contextLength,metadata.contextLength*2]){
  assert.equal(budget(metadata,{modelId:entry.id,modelParameters:[{id:'context',value:String(requested)}]},new Map(),'context'),Math.min(requested,metadata.contextLength));
 }
 assert.equal(budget(metadata,{modelId:entry.id,modelParameters:[]},new Map(),'context'),metadata.contextLength);
 console.log('Native context budget uses the selected size, reports the provider window and caps it at the advertised limit.');
}
