import fs from 'node:fs';
import path from 'node:path';
import {verifyConversationActionsWorkbench,verifyConversationActionsRuntime} from './conversation-actions-check.mjs';
const root=process.argv[2];
if(!root)throw Error('Usage: node scripts/check-conversation-actions.mjs <patched Cursor resources/app>');
for(const surface of ['desktop','glass'])await verifyConversationActionsWorkbench(fs.readFileSync(path.join(root,'out/vs/workbench/workbench.'+surface+'.main.js'),'utf8'),['claude-subscription/']);
for(const name of ['cursor-agent-exec','cursor-local-agent-runtime'])verifyConversationActionsRuntime(fs.readFileSync(path.join(root,'extensions',name,'dist/main.js'),'utf8'));
