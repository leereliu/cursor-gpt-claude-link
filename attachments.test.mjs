import test from 'node:test';
import assert from 'node:assert/strict';
import {attachmentBlock,prepareConversation,cliInput} from './attachments.mjs';
import {prepareRequest,runCli} from './runner.mjs';
import {sanitizeModels} from './catalog.mjs';
import {png,pdf} from './scripts/attachment-fixtures.mjs';
const image={type:'input_image',image_url:'data:image/png;base64,'+png().toString('base64')};
const file={type:'input_file',filename:'sample.pdf',file_data:'data:application/pdf;base64,'+pdf().toString('base64')};
test('image and PDF bytes become native Claude blocks, not text tokens',()=>{
 const input=[{role:'user',content:[{type:'input_text',text:'Read both'},image,file]}];
 const original=JSON.stringify(input);
 const request=prepareRequest({model:'claude-subscription/sonnet',input},sanitizeModels([{value:'sonnet',displayName:'Sonnet'}]));
 assert.equal(JSON.stringify(input),original);
 assert.ok(!request.prompt.includes(png().toString('base64')));
 assert.ok(!request.prompt.includes(pdf().toString('base64')));
 const message=JSON.parse(cliInput(request.prompt,request.attachments));
 assert.equal(message.type,'user');assert.equal(message.message.role,'user');
 const blocks=message.message.content;
 assert.equal(blocks[2].type,'image');assert.deepEqual(Buffer.from(blocks[2].source.data,'base64'),png());
 assert.equal(blocks[4].type,'document');assert.deepEqual(Buffer.from(blocks[4].source.data,'base64'),pdf());
 assert.equal(blocks[4].title,'sample.pdf');
 assert.match(blocks[1].text,/attachment-1/);assert.match(request.prompt,/attachment-1/);
});
test('attachments survive history and multimodal tool results without changing call IDs',()=>{
 const call={type:'function_call',call_id:'call-1',name:'read_image',arguments:'{}'};
 const input=[{role:'user',content:[image]},call,{type:'function_call_output',call_id:'call-1',output:[{type:'text',text:'Tool result'},image]},{role:'user',content:'Compare them'}];
 const {conversation,attachments}=prepareConversation(input);
 assert.equal(attachments.length,2);assert.equal(attachments[1].itemIndex,2);
 assert.deepEqual(conversation[1],call);assert.equal(conversation[2].call_id,'call-1');
 assert.equal(conversation[2].output[1].attachment_id,'attachment-2');
 assert.equal(conversation[3].content,'Compare them');
});
test('URLs are passed as sources without reading local or remote workspace paths',()=>{
 assert.equal(attachmentBlock({type:'input_image',image_url:'https://example.test/test.png'}).source.type,'url');
 assert.equal(attachmentBlock({type:'input_file',file_url:'https://example.test/test.pdf'}).source.type,'url');
 for(const value of ['file:///C:/private.png','C:\\private.png','ssh://test/private.png'])assert.throws(()=>attachmentBlock({type:'input_image',image_url:value}),/URL|file paths/);
 assert.throws(()=>attachmentBlock({type:'input_file',file_id:'file-other-account'}),/file IDs/);
});
test('UTF-8 text documents retain content while unsupported formats fail clearly',()=>{
 const data=Buffer.from('Column A,Column B\n1,2').toString('base64');
 const block=attachmentBlock({type:'input_file',filename:'table.csv',file_data:data});
 assert.equal(block.source.type,'text');assert.equal(block.source.data,'Column A,Column B\n1,2');
 assert.throws(()=>attachmentBlock({type:'input_image',image_url:'data:image/tiff;base64,AAAA'}),/PNG/);
 assert.throws(()=>attachmentBlock({type:'input_file',filename:'binary.exe',file_data:'AAAA'}),/binary format/);
 assert.throws(()=>attachmentBlock({type:'input_audio',data:'test'}),/Unsupported attachment type/);
 assert.throws(()=>attachmentBlock({type:'input_image',image_url:'data:image/png;base64,???'}),/base64/);
});
test('CLI streaming output selects the final result and preserves structured output',async()=>{
 const script='for(const value of [{type:"system"},{type:"assistant",message:{}},{type:"result",structured_output:{text:"ok",tool_calls:[]}}])console.log(JSON.stringify(value));';
 const value=await runCli(process.execPath,['-e',script],{streamJson:true});
 assert.equal(value.structured_output.text,'ok');
});
