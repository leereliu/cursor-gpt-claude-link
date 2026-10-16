if(process.platform==='darwin')await import('./install-macos.mjs');
else await import('./install-windows.mjs');
