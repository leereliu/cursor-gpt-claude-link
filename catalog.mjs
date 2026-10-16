import {spawn} from 'node:child_process';
import {subscriptionEnvironment} from './runner.mjs';

export function sanitizeModels(models) {
  if (!Array.isArray(models) || !models.length) throw new Error('Claude Code returned no models.');
  const seen = new Set();
  return models.map(model => {
    if (typeof model.value !== 'string' || !/^[a-zA-Z0-9._[\]-]+$/.test(model.value) || seen.has(model.value)) throw new Error('Invalid Claude model catalog.');
    seen.add(model.value);
    return {value:model.value, displayName:String(model.displayName || model.value),
      description:String(model.description || ''), resolvedModel:String(model.resolvedModel || ''),
      supportedEffortLevels: model.supportsEffort && Array.isArray(model.supportedEffortLevels)
        ? [...new Set(model.supportedEffortLevels.filter(e => ['low','medium','high','xhigh','max'].includes(e)))] : []};
  });
}

export function discoverModels(executable, {cwd, timeout=20000, spawnProcess=spawn}={}) {
  return new Promise((resolve,reject) => {
    const child=spawnProcess(executable,['-p','--input-format','stream-json','--output-format','stream-json','--verbose',
      '--tools','','--setting-sources','','--settings','{"disableAllHooks":true}',
      '--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--no-chrome','--disable-slash-commands','--no-session-persistence'],
      {cwd,env:subscriptionEnvironment(),windowsHide:true,stdio:['pipe','pipe','pipe']});
    let buffer='',settled=false,catalog;
    const finish=(error,models)=>{if(settled)return;settled=true;clearTimeout(timer);if(error)child.kill();error?reject(error):resolve(models);};
    const timer=setTimeout(()=>finish(new Error('Claude model discovery timed out.')),timeout);
    child.on('error',()=>finish(new Error('Could not start Claude Code model discovery.')));
    child.on('close',code=>{
      if(catalog&&code===0)finish(null,catalog);
      else finish(new Error('Claude model discovery ended without a clean catalog response.'));
    });
    child.stdin.on('error',()=>{});child.stderr.resume();child.stdout.setEncoding('utf8');
    child.stdout.on('data',chunk=>{
      buffer+=chunk;if(buffer.length>1024*1024)return finish(new Error('Claude model catalog exceeded the size limit.'));
      let newline;
      while((newline=buffer.indexOf('\n'))>=0){
        const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);
        let value;try{value=JSON.parse(line);}catch{continue;}
        if(value.type==='control_response' && value.response?.request_id==='model-catalog'){
          try{
            catalog=sanitizeModels(value.response.response?.models);
            // Let Claude release its authentication locks before another CLI call.
            // Killing immediately after initialize can interrupt its cleanup.
            child.stdin.end();
          }catch(error){finish(error);}
        }
      }
    });
    child.stdin.write(JSON.stringify({type:'control_request',request_id:'model-catalog',request:{subtype:'initialize'}})+'\n');
  });
}

export function createCatalog(executable,options={}) {
  let cached,expires=0,pending;
  return async()=>{
    if(cached && Date.now()<expires)return cached;
    if(!pending)pending=discoverModels(executable,options).then(models=>{cached=models;expires=Date.now()+60000;return models;}).finally(()=>{pending=undefined;});
    return pending;
  };
}
