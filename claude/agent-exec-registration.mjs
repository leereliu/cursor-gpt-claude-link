export function patchAgentExecRegistration(source) {
  const marker = '/* subscription-agent-exec-provider */';
  if (source.includes(marker)) return source;
  // Cursor rotates the minified names every build; the shape stays fixed.
  const matches = [...source.matchAll(/activate:([\w$]+),deactivate:([\w$]+)\}\)\.activate/g)];
  if (matches.length !== 1) throw new Error('Agent-exec activation anchor is not unique');
  const [before, activate, deactivate] = matches[0];
  const after = 'activate:(context,options)=>'+activate+'(context,{...options,registerAgentExecProvider:true}),deactivate:'+deactivate+'}).activate';
  return marker+'\n'+source.replace(before,after);
}
