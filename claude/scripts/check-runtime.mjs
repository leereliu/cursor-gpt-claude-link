import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {createHandler} from '../bridge.mjs';
import {sanitizeModels} from '../catalog.mjs';

// Execute the installed adapter and stream guard, without loading the extension
// or copying Cursor's code into the repository. HTTP parsing is mocked here.
async function consume(source,events){
  const pivot=source.indexOf('return"response.created"===e.type');
  const start=source.lastIndexOf('async doStream(',pivot);
  const end=source.indexOf('warnings:n}}}',pivot)+'warnings:n}}'.length;
  assert.ok(start>=0&&end>start,'Supported Responses adapter found');
  const method=source.slice(start,end);
  const helper=method.match(/i=([$\w]+)\(\{finishReason:/)[1];
  const helperStart=source.indexOf('function '+helper+'(');
  const helperEnd=source.indexOf('var ',helperStart);
  const guardPivot=source.indexOf('Provider stream ended without a terminal finish reason');
  const guardStart=source.lastIndexOf('class ',guardPivot);
  const guardEnd=source.indexOf('}})}',guardStart)+4;
  assert.ok(helperStart>=0&&helperEnd>helperStart&&guardStart>=0&&guardEnd>guardStart,'Supported stream guard found');
  const names=[method.match(/value:o\}=await ([$\w]+)\(/)[1],method.match(/headers:([$\w]+)\(/)[1],method.match(/failedResponseHandler:([$\w]+)/)[1],...method.match(/successfulResponseHandler:([$\w]+)\(([$\w]+)\)/).slice(1)];
  const provider=new Function(...names,source.slice(helperStart,helperEnd)+'return ({'+method+'});')(
    async()=>({value:ReadableStream.from(events.map(value=>({success:true,value})))}),()=>({}),{},()=>{},{});
  provider.getArgs=()=>({args:{},warnings:[]});provider.config={url:()=>'',headers:()=>({})};
  const generatorPromise=(_self,_args,_P,fn)=>{const g=fn();return new Promise((resolve,reject)=>{
    const step=(method,value)=>{let result;try{result=g[method](value);}catch(e){reject(e);return;}
      if(result.done)resolve(result.value);else Promise.resolve(result.value).then(v=>step('next',v),e=>step('throw',e));};step('next');
  });};
  const guardSource=source.slice(guardStart,guardEnd);
  const generator=guardSource.match(/const t=t=>([$\w]+)\(/)[1];
  const wrapper=guardSource.match(/function ([$\w]+)\(e\)/)[1];
  const guard=new Function(generator,guardSource+'return '+wrapper+';')(generatorPromise);
  const {stream}=await guard(provider).doStream({});
  const result=[];for await(const value of stream)result.push(value);return result;
}

const root=process.argv[2];
if(!root)throw new Error('Usage: node scripts/check-runtime.mjs <Cursor resources/app>');
const errors=['Claude request timed out.','A Claude subscription sign-in is required.','Usage limit reached.'];
const created={type:'response.created',response:{id:'test-response',created_at:1,model:'claude-subscription/sonnet'}};
let failure=errors[0];
const server=http.createServer(createHandler({config:{key:'test-key',claude:'unused'},
  getCatalog:async()=>sanitizeModels([{value:'sonnet',displayName:'Sonnet'}]),
  inferRequest:async()=>{if(failure)throw new Error(failure);return{answer:{text:'',tool_calls:[{name:'read_file',arguments:'{"path":"example.txt"}'}]},usage:{input_tokens:1,output_tokens:1}};}}));
server.listen(0,'127.0.0.1');await once(server,'listening');
try{
  for(const name of ['cursor-agent-exec','cursor-local-agent-runtime']){
    const source=fs.readFileSync(path.join(root,'extensions',name,'dist/main.js'),'utf8');
    await assert.rejects(consume(source,[created,{type:'response.failed',response:{status:'failed',error:{message:errors[0]}}}]),{name:'LocalIncompleteStreamError'});
    for(const message of [...errors,undefined]){
      failure=message;
      const response=await fetch('http://127.0.0.1:'+server.address().port+'/v1/responses',{method:'POST',headers:{Authorization:'Bearer test-key','Content-Type':'application/json'},
        body:JSON.stringify({model:'claude-subscription/sonnet',input:'Synthetic test',tools:[{type:'function',name:'read_file'}]})});
      const events=(await response.text()).split('\n').filter(line=>line.startsWith('data: ')).map(line=>JSON.parse(line.slice(6)));
      const result=await consume(source,events);
      if(message)assert.equal(result.find(e=>e.type==='error')?.error.message,message);
      else{assert.equal(result.at(-1).finishReason,'tool-calls');assert.equal(result.find(e=>e.type==='tool-call').args,'{"path":"example.txt"}');}
    }
    console.log(name+': reproduced old reconnect failure; corrected errors and tool calls passed.');
  }
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
