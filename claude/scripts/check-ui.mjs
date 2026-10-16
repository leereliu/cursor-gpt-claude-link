import fs from 'node:fs';
import path from 'node:path';
import {verifySubscriptionUi} from './subscription-ui-check.mjs';
const root=process.argv[2];
if(!root)throw Error('Usage: node scripts/check-ui.mjs <patched Cursor resources/app>');
for(const surface of ['desktop','glass'])verifySubscriptionUi(fs.readFileSync(path.join(root,'out/vs/workbench/workbench.'+surface+'.main.js'),'utf8'),['claude']);
