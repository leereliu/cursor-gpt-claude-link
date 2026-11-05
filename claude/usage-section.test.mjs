import test from 'node:test';
import assert from 'node:assert/strict';
import {usageSectionSrc} from './usage-section.mjs';

async function loadUsage(response) {
  const updates=[[],[]];let state=0,cleanup;
  const source=usageSectionSrc({jsx:'jsx',useState:'useState',useEffect:'useEffect',card:'Card',zs:'Rows',bar:'Bar',barStyle:'style'});
  const component=new Function('jsx','useState','useEffect','Card','Rows','Bar','style','fetch','setInterval','clearInterval','__claudeBridgeBase','__claudeBridgeKey',
    source+';return __claudeUsageSection;')(
    (type,props)=>({type,props}),()=>{const i=state++;return[null,value=>updates[i].push(value)];},effect=>{cleanup=effect();},
    'Card',{Root:'Root',Entry:'Entry',Preview:'Preview'},'Bar',{},async()=>response,()=>1,()=>{},'http://127.0.0.1:43188','fixture-key');
  component();
  await new Promise(resolve=>setImmediate(resolve));cleanup();
  return updates;
}

test('usage card preserves the bridge sign-in error instead of hiding it behind HTTP 502',async()=>{
  const message='A Claude subscription sign-in is required. Run claude auth login --claudeai. API billing fallback is disabled.';
  const [usage,errors]=await loadUsage({ok:false,status:502,json:async()=>({error:{message}})});
  assert.deepEqual(usage,[]);assert.deepEqual(errors,[message]);
});

test('usage card keeps the HTTP status for non-JSON errors and still renders valid usage',async()=>{
  const [,errors]=await loadUsage({ok:false,status:502,json:async()=>{throw new Error('not JSON');}});
  assert.deepEqual(errors,['HTTP 502']);
  const data={planType:'Pro',windows:[]};
  assert.deepEqual(await loadUsage({ok:true,json:async()=>data}),[[data],[null]]);
  assert.deepEqual((await loadUsage({ok:true,json:async()=>null}))[1],['Invalid usage response.']);
});
