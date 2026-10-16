import assert from 'node:assert/strict';
import fs from 'node:fs';
const config=JSON.parse(fs.readFileSync(new URL('./config.json',import.meta.url),'utf8'));
const base='http://127.0.0.1:'+config.port;
const headers={Authorization:'Bearer '+config.key,'Content-Type':'application/json'};
assert.equal((await fetch(base+'/picker-models')).status,401);
const account=await (await fetch(base+'/account',{headers})).json();
assert.equal(account.authMethod,'claude.ai');
console.log('Authentication: Claude subscription ('+account.subscriptionType+')');
async function infer(body){
  const res=await fetch(base+'/v1/responses',{method:'POST',headers,body:JSON.stringify({model:'claude-subscription/'+(process.env.CLAUDE_TEST_MODEL||'sonnet'),...body}),signal:AbortSignal.timeout(180000)});
  assert.equal(res.status,200);
  const events=(await res.text()).split('\n').filter(l=>l.startsWith('data: ')).map(l=>JSON.parse(l.slice(6)));
  const failed=events.find(e=>e.type==='error'||e.type==='response.failed');assert.equal(failed,undefined,failed?.message||failed?.response?.error?.message);
  const done=events.find(e=>e.type==='response.completed');assert.ok(done);return done.response.output;
}
const tools=[{type:'function',name:'add',description:'Add two integers',parameters:{type:'object',properties:{a:{type:'integer'},b:{type:'integer'}},required:['a','b'],additionalProperties:false}}];
const prompt={role:'user',content:'Use add for 19 plus 23. After receiving the tool result, answer with only the result.'};
const first=await infer({input:[prompt],tools,tool_choice:{type:'function',name:'add'},reasoning:{effort:'low'}});
const call=first.find(i=>i.type==='function_call');assert.ok(call);const args=JSON.parse(call.arguments);assert.equal(args.a+args.b,42);
const second=await infer({input:[prompt,...first,{type:'function_call_output',call_id:call.call_id,output:'42'}],tools,reasoning:{effort:'low'}});
assert.match(second.filter(i=>i.type==='message').flatMap(i=>i.content).map(i=>i.text).join(''),/42/);
console.log('Live Claude subscription tool call and result round trip: passed');
// Cursor tool names overlap disabled Claude Code built-ins; automatic selection
// must still return an external request rather than attempting a local tool.
const external=[{type:'function',name:'Write',description:'Write a text file in the Cursor workspace.',parameters:{type:'object',properties:{path:{type:'string'},contents:{type:'string'}},required:['path','contents'],additionalProperties:false}}];
const automatic=await infer({input:'Use Write to create cursor-bridge-probe.txt with the text EXTERNAL_TOOL_OK. The host will execute the request.',tools:external,tool_choice:'auto',reasoning:{effort:'low'}});
const write=automatic.find(item=>item.type==='function_call');
assert.equal(write?.name,'Write','Automatic selection must request the external Cursor tool.');
assert.equal(JSON.parse(write.arguments).contents,'EXTERNAL_TOOL_OK');
console.log('Automatic Cursor tool selection: passed (request only; no file written)');
