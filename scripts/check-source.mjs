import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const root=new URL('../',import.meta.url);
for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.mjs'))){
  execFileSync(process.execPath,['--check',fileURLToPath(new URL(file,root))],{stdio:'pipe',windowsHide:true});
}
for(const file of fs.readdirSync(root).filter(name=>/^build-.*\.json$/.test(name))){
  const build=JSON.parse(fs.readFileSync(new URL(file,root),'utf8'));
  if(!file.startsWith('build-'+build.version)||!Object.values(build.files).every(hash=>/^[a-f0-9]{64}$/.test(hash)))throw new Error('Invalid build metadata');
}
console.log('Source syntax and supported build metadata passed.');
