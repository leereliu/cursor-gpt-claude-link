import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {installRuntime} from '../src/runtime-install.mjs';

const freePort=async()=>{const server=net.createServer();server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;};
test('installed runtime starts both authenticated providers from one worker without repository files',async t=>{
  const state=fs.mkdtempSync(path.join(os.tmpdir(),'combined-runtime-'));
  t.after(()=>fs.rmSync(state,{recursive:true,force:true}));
  const runtime=path.join(state,'runtime'),port=await freePort();let claudePort=await freePort();while(claudePort===port)claudePort=await freePort();
  installRuntime(fileURLToPath(new URL('..',import.meta.url)),runtime);
  fs.writeFileSync(path.join(state,'config.json'),JSON.stringify({port,claudePort,key:'synthetic-local-key',claude:'unused-fixture',codexHome:state}));
  const child=spawn(process.execPath,[path.join(runtime,'bridge.mjs')],{env:{...process.env,CURSOR_GPT_LINK_HOME:state},stdio:['ignore','pipe','pipe']});
  let errors='';child.stderr.on('data',data=>errors+=data);
  t.after(async()=>{if(child.exitCode===null){child.kill();await once(child,'exit');}});
  await new Promise((resolve,reject)=>{
    let output='';const timer=setTimeout(()=>reject(new Error('Both providers did not start: '+errors)),10000);
    child.once('exit',code=>{clearTimeout(timer);reject(new Error('Runtime exited: '+code+' '+errors));});
    child.stdout.on('data',data=>{output+=data;if(output.includes('ChatGPT bridge ready')&&output.includes('Claude bridge ready')){clearTimeout(timer);resolve();}});
  });
  const headers={Authorization:'Bearer synthetic-local-key'};
  assert.equal((await fetch('http://127.0.0.1:'+port+'/health')).status,200);
  assert.equal((await fetch('http://127.0.0.1:'+port+'/v1/models')).status,401);
  assert.equal((await fetch('http://127.0.0.1:'+claudePort+'/health')).status,401);
  const health=await fetch('http://127.0.0.1:'+claudePort+'/health',{headers});
  assert.equal((await health.json()).provider,'claude-subscription');
  assert.equal((await fetch('http://127.0.0.1:'+claudePort+'/health',{headers:{...headers,Origin:'https://untrusted.example'}})).status,403);
  assert.equal((await fetch('http://127.0.0.1:'+claudePort+'/unsupported',{headers})).status,404);
});
