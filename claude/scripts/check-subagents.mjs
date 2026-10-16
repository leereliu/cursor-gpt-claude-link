import {verifySubagentSettings} from './subagent-settings-check.mjs';
import {verifySubagentLifecycle} from './subagent-lifecycle-check.mjs';
import {verifySubagentModels} from './subagent-model-check.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {verifySubagentRegistration} from './subagent-registration-check.mjs';
const root=process.argv[2];
if(!root)throw new Error('Usage: node scripts/check-subagents.mjs <patched Cursor resources/app>');
for(const surface of ['desktop','glass']){
 const source=fs.readFileSync(path.join(root,'out/vs/workbench/workbench.'+surface+'.main.js'),'utf8');
 await verifySubagentRegistration(source);
 if(source.includes('var __subscriptionSubagentPrefixes='))await verifySubagentLifecycle(source,['claude-subscription/']);
 console.log(surface+': Claude subagent registration passed.');
}

for(const name of ['cursor-agent-exec','cursor-local-agent-runtime']){
 const source=fs.readFileSync(path.join(root,'extensions',name,'dist/main.js'),'utf8');
 await verifySubagentModels(source);verifySubagentSettings(source);
}
