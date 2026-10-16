import fs from 'node:fs';
import path from 'node:path';

export function installRuntime(sourceDir,runtime){
  fs.mkdirSync(runtime,{recursive:true,mode:0o700});
  for(const name of ['bridge.mjs','config.mjs','openai-icon.mjs','model-tooltip.mjs','context-options.mjs'])fs.copyFileSync(path.join(sourceDir,'src',name),path.join(runtime,name));
  const claude=path.join(runtime,'claude');fs.mkdirSync(claude,{recursive:true,mode:0o700});
  for(const name of ['bridge.mjs','runner.mjs','attachments.mjs','token-usage.mjs','models.mjs','model-options.mjs','model-tooltip.mjs','catalog.mjs','usage.mjs','claude.svg'])fs.copyFileSync(path.join(sourceDir,'claude',name),path.join(claude,name));
}
