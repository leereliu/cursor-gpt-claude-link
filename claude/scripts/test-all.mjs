import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const files=fs.readdirSync(root).filter(file=>file.endsWith('.test.mjs')||file==='test.mjs');
const result=spawnSync(process.execPath,['--test',...files],{cwd:root,stdio:'inherit'});
if(result.error)throw result.error;
process.exit(result.status??1);
