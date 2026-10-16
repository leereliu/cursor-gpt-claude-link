import fs from 'node:fs';
import {cursorRoot,getBuild,requireSupportedOriginals,sha256} from './build-support.mjs';
import {verifyMacSignature} from './macos.mjs';

const command=process.argv[2]||'help';
const manifestFile=new URL('./installed.json',import.meta.url);
try {
  if(['help','--help','-h'].includes(command)){
    console.log('Usage: node patcher.mjs check|status|install|restore\nSet CURSOR_APP_ROOT for a custom Cursor resources/app directory.\nRun node doctor.mjs to check Claude Code sign-in and model discovery.');
  }else if(command==='check'||command==='status'){
    const root=cursorRoot(),build=getBuild(root);
    verifyMacSignature(root);
    if(fs.existsSync(manifestFile)){
      const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
      if(manifest.version!==build.version)throw new Error('Cursor was updated. The installation manifest belongs to '+manifest.version+'. Do not restore old files over the update. See docs/testing.md.');
      for(const file of manifest.files){
        if(sha256(fs.readFileSync(file.path))!==file.patchedHash||sha256(fs.readFileSync(file.backup))!==file.originalHash)throw new Error('Installed files or backups have changed.');
      }
      console.log('Cursor '+build.version+': Claude patch installed; file and backup hashes verified.');
    }else{
      requireSupportedOriginals(root);
      console.log('Cursor '+build.version+': supported files verified; Claude patch is not installed.');
    }
  }else if(command==='install'||command==='restore'){
    if(command==='restore')process.argv.push('--restore');
    await import('./install.mjs');
  }else throw new Error('Unknown command. Run node patcher.mjs help.');
}catch(error){console.error(error.message);process.exitCode=1;}
