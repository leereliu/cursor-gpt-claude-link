export const stripContext = value => value.replace(/\[1m\]$/i,'');

export function modelOptions(catalog) {
  const concrete=catalog.filter(m=>m.value!=='default');
  const rows=catalog.filter(m=>m.value!=='default'||!concrete.some(other=>other.resolvedModel&&stripContext(other.resolvedModel)===stripContext(m.resolvedModel)));
  const grouped=new Map();
  for(const row of rows){
    const value=stripContext(row.value),resolved=stripContext(row.resolvedModel||value);
    const extended=/\[1m\]$/i.test(row.value)||/\[1m\]$/i.test(row.resolvedModel)||/^claude-(?:sonnet-5|fable-5)(?:-|$)/.test(resolved);
    const existing=grouped.get(value);
    if(existing){existing.extended ||= extended;continue;}
    // Older CLIs put the name in front of the description ("Opus 4.8 · Best
    // for …"); newer ones keep the description plain and name it in displayName.
    const named=row.description?.includes(' · ')?row.description.split(' · ')[0]:'';
    const label=(named||row.displayName).replace(/\s+with 1M context/i,'').replace(/\s*\(1M context\)/i,'');
    const family=resolved.match(/claude-(opus|sonnet|fable|haiku)/)?.[1];
    const descriptions={
      opus:'Deep reasoning for complex code, architecture decisions, and difficult debugging.',
      fable:'Thorough investigation and sustained reasoning for demanding, multi-step engineering work.',
      sonnet:'A versatile choice for everyday coding, focused edits, and code reviews.',
      haiku:'Quick answers and lightweight edits for small, well-defined tasks.'
    };
    grouped.set(value,{...row,value,resolvedModel:resolved,extended,
      displayName:label.startsWith('Claude ')?label:'Claude '+label,
      summary:descriptions[family]||row.description||'A model available through your Claude Code subscription.'});
  }
  return [...grouped.values()];
}
