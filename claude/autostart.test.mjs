import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {buildAutostart} from './autostart.mjs';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
for(const seeded of [false,true]) test('autostart survives host exit: '+(seeded?'replace worker':'cold start'), {skip:!['darwin','win32'].includes(process.platform),timeout:30000}, async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-autostart-'));
  const worker=path.join(dir,'worker with spaces.mjs'), pidFile=path.join(dir,'pid.txt');
  fs.writeFileSync(worker,'import fs from "node:fs";fs.writeFileSync('+JSON.stringify(pidFile)+',String(process.pid));setTimeout(()=>process.exit(0),25000);');
  let first,host,unrelated;
  try {
    unrelated=spawn(process.execPath,['-e','setTimeout(()=>{},25000)'],{stdio:'ignore'});
    if(seeded){
      first=spawn(process.execPath,[worker],{stdio:'ignore'});
      for(let i=0;i<100&&!fs.existsSync(pidFile);i++)await delay(50);
      assert.ok(fs.existsSync(pidFile),'original worker started');
    }
    const hostPath=path.join(dir,'host.mjs');
    fs.writeFileSync(hostPath,'await '+buildAutostart({nodePath:process.execPath,bridgePath:worker,stateDir:dir})+'\nprocess.exit(0);');
    host=spawn(process.execPath,[hostPath],{stdio:'ignore'});
    const [code]=await once(host,'exit');
    assert.equal(code,0);
    let replacement;
    for(let i=0;i<400;i++){
      const pid=fs.existsSync(pidFile)?Number(fs.readFileSync(pidFile,'utf8')):0;
      if(pid&&pid!==first?.pid&&alive(pid)){replacement=pid;break;}
      await delay(50);
    }
    assert.ok(replacement,'new worker starts after its original host exits');
    if(first)assert.equal(alive(first.pid),false,'old worker stopped');
    assert.equal(alive(unrelated.pid),true,'unrelated Node processes remain running');
  } finally {
    if(unrelated&&alive(unrelated.pid))unrelated.kill();
    if(host&&host.exitCode===null)host.kill();
    if(first&&alive(first.pid))first.kill();
    if(fs.existsSync(pidFile)){
      const pid=Number(fs.readFileSync(pidFile,'utf8'));
      if(pid&&alive(pid))process.kill(pid);
    }
    assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith('bridge-autostart-'));
    fs.rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
});

test('macOS reports worker startup failures after the launching host exits', {skip:process.platform!=='darwin',timeout:10000}, async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-startup-error-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const worker=path.join(dir,'worker.mjs'),host=path.join(dir,'host.mjs');
  const state=path.join(dir,'.state'),log=path.join(state,'bridge-startup.log');
  fs.mkdirSync(state,{mode:0o755});
  fs.writeFileSync(log,'previous run\n',{mode:0o644});
  fs.writeFileSync(worker,'throw new Error("fixture startup failure");');
  fs.writeFileSync(host,'await '+buildAutostart({nodePath:process.execPath,bridgePath:worker})+'\nprocess.exit(0);');
  const child=spawn(process.execPath,[host],{stdio:'ignore'});
  assert.equal((await once(child,'exit'))[0],0);
  for(let i=0;i<100;i++){
    if(fs.existsSync(log)&&fs.readFileSync(log,'utf8').includes('fixture startup failure'))break;
    await delay(50);
  }
  assert.ok(fs.existsSync(log),'startup log exists');
  assert.match(fs.readFileSync(log,'utf8'),/fixture startup failure/);
  assert.equal(fs.statSync(state).mode&0o777,0o700);
  assert.equal(fs.statSync(log).mode&0o777,0o600);
});

test('macOS preserves a launcher spawn failure before the host exits', {skip:process.platform!=='darwin',timeout:10000}, async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-launcher-error-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const host=path.join(dir,'host.mjs');
  fs.writeFileSync(host,'await '+buildAutostart({nodePath:path.join(dir,'missing-node'),bridgePath:path.join(dir,'bridge.mjs')})+'\nprocess.exit(0);');
  const child=spawn(process.execPath,[host],{stdio:'ignore'});
  assert.equal((await once(child,'exit'))[0],0);
  assert.match(fs.readFileSync(path.join(dir,'.state/bridge-startup.log'),'utf8'),/Local bridge launcher failed:.*ENOENT/);
});
