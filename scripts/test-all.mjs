import {spawnSync} from 'node:child_process';
for(const [file,args] of [
  ['scripts/test-macos.mjs',[]],
  ['claude/scripts/test-all.mjs',[]],
  ['claude/scripts/check-source.mjs',[]],
]){
  const result=spawnSync(process.execPath,[file,...args],{stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status??1);
}
