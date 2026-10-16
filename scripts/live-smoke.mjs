// Explicit opt-in: sends two short GPT requests using the installed local bridge.
// Claude end-to-end tools are verified in Cursor; unit tests never call a model.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const state=process.env.CURSOR_GPT_LINK_HOME||path.join(os.homedir(),'Library/Application Support/cursor-gpt-link');
const config=JSON.parse(fs.readFileSync(path.join(state,'config.json')));
for(const fast of [false,true]){
 const start=performance.now();
 const body={model:'chatgpt-codex/gpt-6.1-sol',input:[{role:'user',content:[{type:'input_text',text:'Reply exactly GPT_COMBINED_BRIDGE_OK. Do not use tools.'}]}],reasoning:{effort:'low'},stream:true,store:false,...(fast?{service_tier:'priority'}:{})};
 const response=await fetch('http://127.0.0.1:'+config.port+'/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+config.key,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(90000)});
 if(!response.ok)throw new Error('GPT bridge HTTP '+response.status+': '+(await response.text()).slice(0,500));
 const text=await response.text();
 const events=text.split('\n').filter(line=>line.startsWith('data: {')).map(line=>JSON.parse(line.slice(6)));
 const result=events.find(event=>event.type==='response.completed')?.response;
 assert.ok(result,'GPT response completed');
 const output=result.output?.flatMap(item=>item.content||[]).map(part=>part.text||'').join('');
 assert.match(output,/GPT_COMBINED_BRIDGE_OK/);
 console.log(JSON.stringify({provider:'gpt',fast,returnedTier:result.service_tier??null,elapsedMs:Math.round(performance.now()-start),outputTokens:result.usage?.output_tokens,result:'passed'}));
}
