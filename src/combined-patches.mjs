import crypto from 'node:crypto';
import {buildPatches as buildGptPatches} from './patches.mjs';
import {supportedBuild, symbolsFor} from './supported-builds.mjs';
import {patchClaudeWorkbench} from '../claude/patches-workbench.mjs';
import {patchRuntime} from '../claude/patches-runtime.mjs';
import {patchRemoteControlGuard} from '../claude/remote-control.mjs';
import {pickerModels} from '../claude/models.mjs';
import {pickerSectionHelpersSrc} from '../claude/picker-sections.mjs';
import {usageLabelHelpersSrc} from '../claude/usage-label.mjs';

const once=(source,before,after)=>{
  if(source.split(before).length!==2)throw new Error('Combined patch anchor is not unique: '+before.slice(0,100));
  return source.replace(before,after);
};

export function buildPatches(options){
  const build=supportedBuild(options.root),symbols=symbolsFor(build.version);
  if(build.version!=='3.24.12'||!symbols)throw new Error('Combined installation currently requires reviewed Cursor 3.24.12.');
  const {cfg,claudeCatalog=[]}=options;
  const prelude=`
var __claudeBridgeModels=${JSON.stringify(pickerModels(claudeCatalog))};
const __claudeBridgeBase=${JSON.stringify('http://127.0.0.1:'+cfg.claudePort)},__claudeBridgeKey=${JSON.stringify(cfg.key)};
function __isClaudeBridgeModel(m){return typeof m==="string"&&m.startsWith("claude-subscription/")}
function __withClaudeBridgeModels(models){return [...__claudeBridgeModels,...models.filter(m=>!__isClaudeBridgeModel(m.name))]}
async function __refreshClaudeBridgeModels(){try{const r=await fetch(__claudeBridgeBase+"/picker-models",{headers:{Authorization:"Bearer "+__claudeBridgeKey},signal:AbortSignal.timeout(25000)});if(!r.ok)return;const v=await r.json();if(Array.isArray(v.models)&&v.models.length)__claudeBridgeModels=v.models}catch{}}
${pickerSectionHelpersSrc}
${usageLabelHelpersSrc}
`;
  const pending=buildGptPatches(options);
  for(const file of pending){
    const surface=file.path.match(/workbench\.(desktop|glass)\.main\.js$/)?.[1];
    if(surface)file.content=patchRemoteControlGuard(patchClaudeWorkbench(file.content,surface,symbols[surface],{once,prelude}));
    if(/extensions[\\/](cursor-agent-exec|cursor-local-agent-runtime)[\\/]dist[\\/]main\.js$/.test(file.path))file.content=patchRuntime(file.content);
  }
  const product=pending.find(f=>f.path.endsWith('product.json'));
  const metadata=JSON.parse(product.content);
  const desktop=pending.find(f=>f.path.endsWith('workbench.desktop.main.js'));
  metadata.checksums['vs/workbench/workbench.desktop.main.js']=crypto.createHash('sha256').update(desktop.content).digest('base64').replace(/=+$/,'');
  product.content=JSON.stringify(metadata,null,2);
  return pending;
}
