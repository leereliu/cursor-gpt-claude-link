import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once, EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createHandler} from './bridge.mjs';
import {sanitizeModels, discoverModels} from './catalog.mjs';
import {runCli} from './runner.mjs';

const config={key:'synthetic-test-key',claude:'unused'};
const headers={Authorization:'Bearer '+config.key,'Content-Type':'application/json'};
const catalog=sanitizeModels([{value:'sonnet',displayName:'Sonnet'}]);
export const parseEvents=text=>text.split('\n').filter(line=>line.startsWith('data: ')).map(line=>JSON.parse(line.slice(6)));
async function fixture(t,inferRequest){
  const records=[];
  const server=http.createServer(createHandler({config,getCatalog:async()=>catalog,inferRequest,report:record=>records.push(record)}));
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const base='http://127.0.0.1:'+server.address().port;
  const request=(signal)=>fetch(base+'/v1/responses',{method:'POST',headers,signal,
    body:JSON.stringify({model:'claude-subscription/sonnet',input:'Synthetic test input'})});
  return{records,base,request};
}
test('CLI failures produce terminal error events and release the request slot',async t=>{
  let requests=0;
  const {request,base,records}=await fixture(t,async()=>{
    requests++;
    if(requests===1)throw new Error('Claude request timed out.');
    return{answer:{text:'ok',tool_calls:[]},usage:{input_tokens:3,output_tokens:1}};
  });
  const events=parseEvents(await (await request()).text());
  assert.deepEqual(events.map(e=>e.type),['response.created','error']);
  assert.equal(events[1].message,'Claude request timed out.');
  assert.equal(events[1].code,'claude_request_failed');
  assert.equal(events[1].sequence_number,1);
  assert.equal((await(await fetch(base+'/health',{headers})).json()).active,0);
  const done=parseEvents(await(await request()).text()).at(-1);
  assert.equal(done.type,'response.completed');
  assert.equal(done.response.output[0].content[0].text,'ok');
  assert.deepEqual(records.map(r=>r.status),['started','failed','started','completed']);
  assert.equal(JSON.stringify(records).includes('Synthetic test input'),false);
  assert.equal(JSON.stringify(records).includes(config.key),false);
});
test('disconnect cancels Claude work and clears active requests',async t=>{
  let onStart;
  const started=new Promise(resolve=>{onStart=resolve;});
  let onCancel;
  const cancelled=new Promise(resolve=>{onCancel=resolve;});
  const {request,base}=await fixture(t,async(_cli,_body,{signal})=>new Promise((_resolve,reject)=>{
    signal.addEventListener('abort',()=>{onCancel();reject(new Error('cancelled'));},{once:true});onStart();
  }));
  const abort=new AbortController();
  await request(abort.signal);await started;abort.abort();
  await cancelled;
  assert.equal((await(await fetch(base+'/health',{headers})).json()).active,0);
});

function catalogChild(){
  const child=new EventEmitter();
  child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();
  child.killed=false;child.kill=()=>{child.killed=true;};
  return child;
}
test('model discovery closes stdin and waits for CLI cleanup instead of killing it',async()=>{
  const child=catalogChild();let settled=false;
  const pending=discoverModels('unused',{spawnProcess:()=>child}).then(value=>{settled=true;return value;});
  child.stdout.write(JSON.stringify({type:'control_response',response:{request_id:'model-catalog',response:{models:[{value:'sonnet'}]}}})+'\n');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(child.stdin.writableEnded,true);
  assert.equal(child.killed,false);assert.equal(settled,false);
  child.emit('close',0);
  assert.equal((await pending)[0].value,'sonnet');assert.equal(child.killed,false);
});
test('stalled model discovery remains bounded',async()=>{
  const child=catalogChild();
  await assert.rejects(discoverModels('unused',{spawnProcess:()=>child,timeout:5}),/timed out/);
  assert.equal(child.killed,true);
});
test('logged-out CLI status provides the subscription login command',async()=>{
  await assert.rejects(runCli(process.execPath,['-e','console.log(JSON.stringify({loggedIn:false,authMethod:"none"}));process.exitCode=1;']),/claude auth login --claudeai/);
});
test('live picker-models advertises MAX for extended models',async t=>{
  const catalog=sanitizeModels([{value:'opus',displayName:'Opus',resolvedModel:'claude-opus-5[1m]',description:'Opus 5 with 1M context'}]);
  const server=http.createServer(createHandler({config,getCatalog:async()=>catalog,inferRequest:async()=>({answer:{text:'',tool_calls:[]}})}));
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const base='http://127.0.0.1:'+server.address().port;
  const listed=(await (await fetch(base+'/picker-models',{headers})).json()).models[0];
  assert.equal(listed.supportsMaxMode,true);
  assert.equal(listed.contextTokenLimit,200000);
  assert.equal(listed.contextTokenLimitForMaxMode,1000000);
});
