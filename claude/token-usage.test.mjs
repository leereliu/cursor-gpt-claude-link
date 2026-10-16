import test from 'node:test';
import assert from 'node:assert/strict';
import {parseResultStream,responsesUsage} from './token-usage.mjs';
const usage=(input,read=0,write=0,output=23)=>({input_tokens:input,cache_read_input_tokens:read,cache_creation_input_tokens:write,output_tokens:output});
const assistant=(id,value,parent)=>({type:'assistant',parent_tool_use_id:parent,message:{id,usage:value}});
const result=value=>({type:'result',usage:value,structured_output:{text:'ok',tool_calls:[]}});
const parse=events=>parseResultStream(events.map(e=>JSON.stringify(e)).join('\n'));

test('a 200K cumulative turn does not fill a 69K context window',()=>{
 const last=usage(1000,68000,0);
 const cumulative={...usage(3000,197000,0,900),iterations:[
  {type:'message',...usage(1000,63000,0,100)},
  {type:'message',...usage(1000,66000,0,200)},
  {type:'message',...last,output_tokens:600}]};
 const parsed=parse([assistant('a',usage(1000,63000)),assistant('b',usage(1000,66000)),assistant('c',last),result(cumulative)]);
 assert.equal(parsed.usageDiagnostics.cumulativeInputTokens,200000);
 assert.equal(parsed.usageDiagnostics.contextInputTokens,69000);
 assert.deepEqual(responsesUsage(parsed.contextUsage),{input_tokens:69000,output_tokens:600,total_tokens:69600,input_tokens_details:{cached_tokens:68000}});
 assert.equal(parsed.usage.input_tokens,3000);
});
test('duplicate assistant IDs and subagent events do not inflate context',()=>{
 const parsed=parse([assistant('a',usage(50,200,300)),assistant('b',usage(80,400,500)),assistant('a',usage(50,200,300)),assistant('nested',usage(500000), 'tool-1'),result(usage(130,600,800,600))]);
 assert.equal(parsed.usageDiagnostics.modelSteps,2);
 assert.equal(parsed.usageDiagnostics.contextInputTokens,980);
 assert.equal(parsed.contextUsage.output_tokens,600);
 assert.equal(parsed.usageDiagnostics.outputCountSource,'turn_total');
});
test('cache creation subfields are not counted twice',()=>{
 const value={...usage(10,200,300,20),cache_creation:{ephemeral_5m_input_tokens:100,ephemeral_1h_input_tokens:200}};
 assert.equal(responsesUsage(value).input_tokens,510);
});
test('later results cannot reuse an earlier turn context',()=>{
 const parsed=parse([assistant('a',usage(50000)),result(usage(50000)),result(usage(90000))]);
 assert.equal(parsed.contextUsage,undefined);
 assert.throws(()=>responsesUsage(parsed.contextUsage),/per-step/);
});
test('final iterations are usable when the CLI omits assistant events',()=>{
 const parsed=parse([result({...usage(100000),iterations:[{type:'message',...usage(60000,0,0,70)},{type:'message',...usage(40000,0,0,30)}]})]);
 assert.equal(parsed.contextUsage.input_tokens,40000);
 assert.equal(parsed.contextUsage.output_tokens,30);
});
test('iteration output is not mixed with a different prompt snapshot',()=>{
 const parsed=parse([assistant('a',usage(20,500)),result({...usage(30,1000,0,900),iterations:[{type:'message',...usage(30,1000,0,10)}]})]);
 assert.equal(parsed.contextUsage.input_tokens,20);
 assert.equal(parsed.contextUsage.cache_read_input_tokens,500);
 assert.equal(parsed.contextUsage.output_tokens,900);
});
