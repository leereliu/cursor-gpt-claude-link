import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {findClaude} from './cli-path.mjs';
import {subscriptionEnvironment, requireSubscription} from './runner.mjs';
import {discoverModels} from './catalog.mjs';

const configFile=new URL('./config.json',import.meta.url);
const result={cliFound:false,version:null,authMethod:null,subscriptionType:null,
  patchManifestPresent:fs.existsSync(new URL('./installed.json',import.meta.url))};
try{
  const executable=fs.existsSync(configFile)?JSON.parse(fs.readFileSync(configFile,'utf8')).claude:findClaude();
  result.cliFound=fs.existsSync(executable);
  result.executable=executable;
  result.version=execFileSync(executable,['--version'],{env:subscriptionEnvironment(),encoding:'utf8',windowsHide:true,timeout:15000,stdio:['ignore','pipe','pipe']}).trim();
  Object.assign(result,await requireSubscription(executable));
  result.models=await discoverModels(executable);
}catch{result.error='Could not verify Claude Code and subscription. Check installation and run claude auth login --claudeai.';}
// No email, organization IDs, raw CLI output or credentials.
console.log(JSON.stringify(result,null,2));
