const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function bridgeCommandPattern(nodePath, bridgePath) {
  return '^"?' + escapeRegex(nodePath) + '"?\\s+"?' + escapeRegex(bridgePath) + '"?\\s*$';
}

export function bridgeCommandPosixPattern(nodePath, bridgePath) {
  return '^"?' + escapeRegex(nodePath) + '"?[[:space:]]+"?' + escapeRegex(bridgePath) + '"?[[:space:]]*$';
}

export function buildBridgeLauncher({nodePath, bridgePath, stateDir}) {
  // Restart only this installation's worker. The pattern is passed as an
  // argument to pkill (no shell), matching cursor-gpt-link.
  const pattern = bridgeCommandPosixPattern(nodePath, bridgePath);
  const windowsPattern=bridgeCommandPattern(nodePath,bridgePath).replaceAll("'", "''");
  const restart=`Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match '${windowsPattern}' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
  const encoded=Buffer.from(restart,'utf16le').toString('base64');
  return `
const {execFile,spawn}=require("node:child_process");
const start=()=>{
  const worker=spawn(${JSON.stringify(nodePath)},[${JSON.stringify(bridgePath)}],{
    detached:true,windowsHide:true,stdio:["ignore","ignore",2],
    env:{...process.env,ELECTRON_RUN_AS_NODE:undefined,...${JSON.stringify(stateDir?{CURSOR_CLAUDE_LINK_HOME:stateDir}:{})}}
  });
  worker.on("error",error=>console.error("Local bridge startup failed:",error.message));worker.unref();
};
if(process.platform==="win32")execFile("powershell.exe",["-NoProfile","-NonInteractive","-EncodedCommand",${JSON.stringify(encoded)}],{windowsHide:true,timeout:15000},()=>start());
else if(process.platform==="darwin")execFile("pkill",["-f",${JSON.stringify(pattern)}],{timeout:5000},error=>{
  if(error&&error.code!==1){console.error("Local bridge restart failed:",error.message);return;}start();
});
else start();
`;
}

export function buildAutostart(options) {
  // A detached launcher owns the entire stop/start sequence. A secondary
  // Cursor process may exit before the previous bridge worker is replaced.
  return `
/* cursor subscription bridge autostart */
import("node:child_process").then(async({spawn})=>{
  const fs=await import("node:fs"),path=await import("node:path");
  const state=path.join(${JSON.stringify(options.stateDir)}||path.dirname(${JSON.stringify(options.bridgePath)}),".state");
  fs.mkdirSync(state,{recursive:true,mode:0o700});fs.chmodSync(state,0o700);
  const log=fs.openSync(path.join(state,"bridge-startup.log"),"a",0o600);fs.fchmodSync(log,0o600);
  try{
  const launcher=spawn(${JSON.stringify(options.nodePath)},["-e",${JSON.stringify(buildBridgeLauncher(options))}],{
    detached:true,windowsHide:true,stdio:["ignore","ignore",log],
    env:{...process.env,ELECTRON_RUN_AS_NODE:undefined}
  });
  await new Promise((resolve,reject)=>{launcher.once("spawn",resolve);launcher.once("error",reject);});launcher.unref();
  }catch(error){fs.writeSync(log,"Local bridge launcher failed: "+error.message+"\\n");}
  finally{fs.closeSync(log);}
}).catch(error=>console.error("Local bridge launcher failed:",error.message));
`;
}
